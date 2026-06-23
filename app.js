let paymentHistory =
JSON.parse(
  localStorage.getItem("paymentHistory")
) || [];

let archives =
JSON.parse(localStorage.getItem("archives")) || [];

let expenses =
JSON.parse(localStorage.getItem("expenses")) || [];


function renderAnalytics(){

  if(!archives.length) return;

  const best = archives.reduce(
    (a,b)=>
    b.collected > a.collected
      ? b
      : a
  );

  const avg =
  archives.reduce(
    (sum,a)=>
    sum + a.collected,
    0
  ) / archives.length;

  $("bestMonth").innerText =
    best.month;

  $("highestCollection").innerText =
    "₱" +
    best.collected.toLocaleString();

  $("averageCollection").innerText =
    "₱" +
    Math.round(avg).toLocaleString();
}
// ================= SAFE STORAGE =================
function loadStudents(){
  try{
    return JSON.parse(localStorage.getItem("students")) || [];
  }catch{
    return [];
  }
}

let students = loadStudents();
let startDate = localStorage.getItem("startDate") || null;
let skippedWeeks =
JSON.parse(localStorage.getItem("skippedWeeks")) || [];
let lastImportedStudentIds =
JSON.parse(localStorage.getItem("lastImportedStudentIds")) || [];

const WEEKLY_FEE = 5;



// ================= SAFE HELPERS =================
function $(id){ return document.getElementById(id); }

function toNumber(v){
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// ================= SAVE =================
function save(){
  localStorage.setItem("students", JSON.stringify(students));
  localStorage.setItem("skippedWeeks", JSON.stringify(skippedWeeks));
  localStorage.setItem("expenses", JSON.stringify(expenses));
}

// ================= SETTINGS =================
function saveSettings(){

  startDate = $("startDate").value;

  localStorage.setItem(
    "startDate",
    startDate
  );

  renderCalendar();
  render();
}



// ================= WEEK =================
function getCurrentWeek(){

 

  if(!startDate) return 1;

  const start = new Date(startDate);
  const today = new Date();

  start.setHours(0,0,0,0);
  today.setHours(0,0,0,0);

  let weekdays = 0;

  const current = new Date(start);

  while(current <= today){

    const day = current.getDay();

    if(day !== 0 && day !== 6){
      weekdays++;
    }

    current.setDate(current.getDate() + 1);
  }

  return Math.max(1, Math.ceil(weekdays / 5));
}

// ================= ADD STUDENT =================
function addStudent(){

  const name = $("studentName")?.value?.trim();
  if(!name) return;

  students.push({
    id: Date.now(),
    name,
    payments:[]
  });

  $("studentName").value = "";
  save();
  render();
}

function cleanImportedStudentName(line){
  return line
    .replace(/\b(MALE|FEMALE)\b/gi, " ")
    .replace(/\b(NO|NAME|STUDENT|STUDENTS|CLASS|SECTION|LIST|GRADE)\b/gi, " ")
    .replace(/^[\s\d.)-]+/g, "")
    .replace(/[^\p{L}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeImportedText(text){
  return text
    .replace(/[|]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\t/g, "  ");
}

function splitNumberedStudentLine(line){
  const normalized = line
    .replace(/([A-Za-z])(\d{1,2}\s+[A-Z])/g, "$1 $2")
    .trim();

  const parts = normalized
    .split(/\s+(?=\d{1,2}[\s.)-]+[A-Z])/g)
    .map(part => part.trim());

  return parts.length ? parts : [line];
}

function looksLikeStudentName(name){
  const lowered = name.toLowerCase();
  const ignoredWords = new Set([
    "male",
    "female",
    "name",
    "student",
    "students",
    "class",
    "section",
    "list",
    "grade",
    "no",
    "number"
  ]);

  if(!name || name.length < 4) return false;
  if(ignoredWords.has(lowered)) return false;
  if(!/[a-z]/i.test(name)) return false;
  if(name.split(" ").length > 7) return false;
  if(/^\W+$/.test(name)) return false;

  return true;
}

function getImportedNames(text){
  const seen = new Set();
  const names = [];

  normalizeImportedText(text)
    .split(/\r?\n/)
    .flatMap(splitNumberedStudentLine)
    .map(cleanImportedStudentName)
    .filter(looksLikeStudentName)
    .forEach(name => {
      const key = name.toLowerCase();

      if(seen.has(key)) return;

      seen.add(key);
      names.push(name);
    });

  return names;
}

function setImportPreview(names){
  const preview = $("importPreview");
  const previewBox = $("importPreviewBox");

  if(!preview || !previewBox) return;

  preview.value = names.join("\n");
  previewBox.classList.toggle("show", names.length > 0);
}

function clearStudentImportPreview(){
  const preview = $("importPreview");
  const previewBox = $("importPreviewBox");
  const status = $("importStatus");

  if(preview) preview.value = "";
  if(previewBox) previewBox.classList.remove("show");
  if(status) status.innerText = "Ready to scan a student list.";
}

function addImportedStudents(names){
  const existing = new Set(
    students.map(s => (s.name || "").trim().toLowerCase())
  );

  const uniqueNames = [];
  const importedIds = [];

  names.forEach(name => {
    const key = name.toLowerCase();

    if(existing.has(key)) return;

    existing.add(key);
    uniqueNames.push(name);
  });

  uniqueNames.forEach((name,index) => {
    const id = Date.now() + index;

    students.push({
      id,
      name,
      payments:[]
    });

    importedIds.push(id);
  });

  if(uniqueNames.length){
    lastImportedStudentIds = importedIds;
    localStorage.setItem(
      "lastImportedStudentIds",
      JSON.stringify(lastImportedStudentIds)
    );

    save();
    render();
  }

  return uniqueNames.length;
}

async function importStudentsFromImage(event){
  const file = event.target.files?.[0];
  const status = $("importStatus");

  if(!file) return;

  if(!window.Tesseract){
    if(status){
      status.innerText = "OCR library is still loading. Please try again in a moment.";
    }
    return;
  }

  try{
    if(status){
      status.innerText = "Scanning image... this can take a few seconds.";
    }

    const result = await Tesseract.recognize(file, "eng", {
      logger(progress){
        if(!status || progress.status !== "recognizing text") return;

        const percent = Math.round((progress.progress || 0) * 100);
        status.innerText = `Reading names... ${percent}%`;
      }
    });

    const names = getImportedNames(result.data.text || "");

    setImportPreview(names);

    if(status){
      status.innerText = names.length
        ? `Found ${names.length} possible name${names.length === 1 ? "" : "s"}. Review them below, then import.`
        : "No names found. Try cropping only the student list or using a clearer image.";
    }
  }catch(error){
    console.error(error);

    if(status){
      status.innerText = "Could not scan this image. Try a clearer photo or screenshot.";
    }
  }finally{
    event.target.value = "";
  }
}

function confirmStudentImport(){
  const preview = $("importPreview");
  const status = $("importStatus");

  if(!preview) return;

  const names = getImportedNames(preview.value);
  const added = addImportedStudents(names);

  if(status){
    status.innerText = added
      ? `Added ${added} reviewed student${added === 1 ? "" : "s"}.`
      : "No new students added. They may already exist or the preview is empty.";
  }

  if(added){
    clearStudentImportPreview();
  }
}

function undoLastStudentImport(){
  const status = $("importStatus");

  if(!lastImportedStudentIds.length){
    if(status){
      status.innerText = "There is no recent import to undo.";
    }
    return;
  }

  const ids = new Set(lastImportedStudentIds);
  const before = students.length;

  students = students.filter(student => !ids.has(student.id));
  lastImportedStudentIds = [];

  localStorage.setItem(
    "lastImportedStudentIds",
    JSON.stringify(lastImportedStudentIds)
  );

  save();
  render();

  const removed = before - students.length;

  if(status){
    status.innerText = removed
      ? `Removed ${removed} student${removed === 1 ? "" : "s"} from the last import.`
      : "No matching students from the last import were found.";
  }
}

// ================= ADD PAYMENT =================
function addPayment(){

  const id = toNumber($("studentSelect")?.value);
  const amount = toNumber($("paymentAmount")?.value);

  if(!id){
    alert("Please select a student first.");
    return;
  }

  if(amount <= 0){
    alert("Please enter a valid payment amount.");
    return;
  }

  const s = students.find(x=>x.id===id);
  if(!s){
    alert("Selected student not found. Please refresh the student list.");
    renderSelect();
    return;
  }

  const now = new Date();

  s.payments.push({
    amount,
    date: now.toLocaleString(),
    month: now.toLocaleString("en-US",{
      month:"long",
      year:"numeric"
    })
  });

  $("paymentAmount").value = "";
  save();
  render();
}

function getTotalCollected(){
  return students.reduce((sum,student) => sum + getTotal(student),0);
}

function getTotalExpenses(){
  return expenses.reduce((sum,expense) => sum + toNumber(expense.amount),0);
}

function readReceiptImage(file){
  return new Promise((resolve,reject) => {
    if(!file){
      resolve(null);
      return;
    }

    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function addExpense(){
  const title = $("expenseTitle")?.value?.trim();
  const amount = toNumber($("expenseAmount")?.value);
  const date = $("expenseDate")?.value || new Date().toISOString().slice(0,10);
  const receiptFile = $("expenseReceipt")?.files?.[0];

  if(!title || amount <= 0) return;

  let receipt = null;

  try{
    receipt = await readReceiptImage(receiptFile);
  }catch(error){
    console.error(error);
    alert("Could not read the receipt image. Try another image.");
    return;
  }

  expenses.push({
    id: Date.now(),
    title,
    amount,
    date,
    receipt
  });

  $("expenseTitle").value = "";
  $("expenseAmount").value = "";
  $("expenseDate").value = "";
  if($("expenseReceipt")) $("expenseReceipt").value = "";

  save();
  render();
}

function deleteExpense(id){
  const confirmed = confirm("Delete this expense record?");

  if(!confirmed) return;

  expenses = expenses.filter(expense => expense.id !== id);

  save();
  render();
}

function renderExpenses(){
  const tbody = $("expenseTable");
  const total = getTotalExpenses();
  const balance = getTotalCollected() - total;

  if($("expenseTotal")) animateNumber($("expenseTotal"), total);
  if($("netBalance")) animateNumber($("netBalance"), balance);
  if($("expensesPageTotal")) animateNumber($("expensesPageTotal"), total);
  if($("expensesPageBalance")) animateNumber($("expensesPageBalance"), balance);

  if(!tbody) return;

  tbody.innerHTML = "";

  if(!expenses.length){
    tbody.innerHTML = `
      <tr>
        <td colspan="5">No expenses recorded yet.</td>
      </tr>
    `;
    return;
  }

  expenses
    .slice()
    .sort((a,b) => new Date(b.date) - new Date(a.date))
    .forEach(expense => {
      tbody.innerHTML += `
        <tr>
          <td>${expense.date || "-"}</td>
          <td>${expense.title}</td>
          <td>₱${toNumber(expense.amount).toLocaleString()}</td>
          <td>
            ${
              expense.receipt
                ? `<button class="receipt-link" onclick="openReceiptModal(${expense.id})">
                    <img class="receipt-thumb" src="${expense.receipt}" alt="Receipt for ${expense.title}">
                  </button>`
                : `<span class="muted-text">No receipt</span>`
            }
          </td>
          <td><button onclick="deleteExpense(${expense.id})">Delete</button></td>
        </tr>
      `;
    });
}

function openReceiptModal(id){
  const expense = expenses.find(item => item.id === id);
  const modal = $("receiptModal");
  const image = $("receiptPreviewImage");

  if(!expense?.receipt || !modal || !image) return;

  image.src = expense.receipt;
  modal.style.display = "flex";
}

function closeReceiptModal(){
  const modal = $("receiptModal");
  const image = $("receiptPreviewImage");

  if(image) image.src = "";
  if(modal) modal.style.display = "none";
}

// ================= COMPUTE =================
function getTotal(s){
  return (s.payments||[]).reduce((a,b)=>a + toNumber(b.amount),0);
}

function getWeeks(total){
  return Math.floor(total / WEEKLY_FEE);
}

function getDebt(weeks){

  const cur = getCurrentWeek();

  let validWeeks = 0;

  for(let i = 1; i <= cur; i++){
    if(!isSkipped(i)) validWeeks++;
  }

  const debtWeeks = validWeeks - weeks;

  return Math.max(0, debtWeeks * WEEKLY_FEE);
}

// ================= DELETE =================
function deleteStudent(id){
  students = students.filter(s=>s.id!==id);
  save();
  render();
}

function deletePayment(id,i){
  const s = students.find(x=>x.id===id);
  if(!s) return;

  s.payments.splice(i,1);
  save();
  render();
}

// ================= EDIT PAYMENT =================
function editPayment(studentId,index){

  const s = students.find(x=>x.id===studentId);
  if(!s || !s.payments[index]) return;

  const newAmount = prompt("Edit payment:", s.payments[index].amount);

  const num = Number(newAmount);
  if(newAmount === null || isNaN(num)) return;

  s.payments[index].amount = num;

  save();
  render();
}

// ================= ANIMATION =================
function animateNumber(el,target){

  if(!el) return;

  target = toNumber(target);

  let start = performance.now();

  function run(now){
    let p = Math.min((now-start)/800,1);
    let val = Math.floor(p*target);

    el.innerText = "₱" + val.toLocaleString();

    if(p<1) requestAnimationFrame(run);
    else el.innerText = "₱" + target.toLocaleString();
  }

  requestAnimationFrame(run);
}

// ================= RENDER =================
function render(){

  const tbody = $("studentTable");
  if(!tbody) return;

  tbody.innerHTML = "";

  const search = ($("studentSearch")?.value || $("searchInput")?.value || "").toLowerCase();

  const cur = getCurrentWeek();

  let totalCollected = 0;
  let updated = 0;
  let advanced = 0;

  const filtered = students.filter(s =>
    (s.name||"").toLowerCase().includes(search)
  );

  filtered.forEach(s=>{

    const total = getTotal(s);
    const weeks = getWeeks(total);
    const debt = getDebt(weeks);

    totalCollected += total;

    if(weeks===cur) updated++;
    if(weeks>cur) advanced++;

    let history = "";

    (s.payments||[]).forEach((p,i)=>{
      history += `
        ₱${p.amount}
        <button onclick="editPayment(${s.id},${i})">✏</button>
        <button onclick="deletePayment(${s.id},${i})">🗑</button><br>
      `;
    });

    tbody.innerHTML += `
      <tr>
        <td><button onclick="viewStudent(${s.id})">${s.name}</button></td>
        <td>₱${total}</td>
        <td>${weeks}</td>
        <td>₱${debt}</td>
        <td>${weeks>=cur?"OK":"DEBT"}</td>
        <td>${history}</td>
        <td><button onclick="deleteStudent(${s.id})">Delete</button></td>
      </tr>
    `;
  });

  let validWeeks = 0;

for(let i = 1; i <= cur; i++){
  if(!isSkipped(i)) validWeeks++;
}

const expected =
validWeeks * WEEKLY_FEE * students.length;

  // ================= EXISTING DASHBOARD =================
  animateNumber($("collected"), totalCollected);
  animateNumber($("expected"), expected);
  animateNumber($("remaining"), Math.max(0,expected-totalCollected));

  $("studentCount").innerText = students.length;
  $("updatedCount").innerText = updated;
  $("advancedCount").innerText = advanced;

  // ================= 🔥 ADDED FEATURE (NO REMOVAL) =================
  const eventFund = totalCollected * 0.70;
  const reserveFund = totalCollected * 0.30;

  animateNumber($("eventFund"), eventFund);
  animateNumber($("reserveFund"), reserveFund);

  renderExpenses();
  
  renderSelect();

  saveArchive();
  renderArchive();

  if(typeof renderAnalytics === "function"){
    renderAnalytics();
  }
}

 // ================= DROPDOWN =================
function renderPaymentsForSelectedStudent(){
  const sel = $("studentSelect");
  const container = $("paymentTable");
  if(!sel || !container) return;

  const selectedId = toNumber(sel.value);
  const student = students.find(x => x.id === selectedId);

  if(!selectedId || !student){
    container.innerHTML = `
      <div class="muted-text" style="padding:12px 0 2px;">
        Select a student to view their payments.
      </div>
    `;
    return;
  }

  const payments = student.payments || [];

  if(!payments.length){
    container.innerHTML = `
      <div class="muted-text" style="padding:12px 0 2px;">
        No payments recorded for <strong>${student.name}</strong> yet.
      </div>
    `;
    return;
  }

  // Table UI (matches existing table styling)
  const rows = payments
    .slice()
    .map((p, i) => `
      <tr>
        <td>₱${toNumber(p.amount).toLocaleString()}</td>
        <td>${p.date || "-"}</td>
        <td>${p.month || "-"}</td>
        <td>
          <button onclick="editPayment(${student.id},${i})">✏ Edit</button>
          <button onclick="deletePayment(${student.id},${i})">🗑 Delete</button>
        </td>
      </tr>
    `).join("");

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Amount</th>
          <th>Date</th>
          <th>Month</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function renderSelect(){

  const sel = $("studentSelect");
  if(!sel) return;

  const search = ($("paymentStudentSearch")?.value || "").toLowerCase();

  // Preserve selection across rebuild
  const prevSelectedId = toNumber(sel.value);

  sel.innerHTML = "";

  const filtered = students
    .filter(s => (s.name || "").toLowerCase().includes(search));

  if(!filtered.length){
    sel.innerHTML = `<option value="">No students found</option>`;
    // If we show placeholder, clear payments list
    if(typeof renderPaymentsForSelectedStudent === "function"){
      renderPaymentsForSelectedStudent();
    }
    return;
  }

  filtered.forEach(s=>{
    sel.innerHTML += `<option value="${s.id}">${s.name}</option>`;
  });

  // Restore previous selection if it still matches search; otherwise auto-select first
  const stillExists = filtered.some(s => s.id === prevSelectedId);

  if(stillExists){
    sel.value = String(prevSelectedId);
  }else{
    sel.value = String(filtered[0].id);
  }

  if(typeof renderPaymentsForSelectedStudent === "function"){
    renderPaymentsForSelectedStudent();
  }
}


function payAll(amount){

  amount = Number(amount);

  if(!amount || amount <= 0) return;

  const date = new Date().toLocaleString();

  students.forEach(student => {
    student.payments.push({
      amount,
      date
    });
  });

  save();
  render();

  console.log(`Added ₱${amount} to ${students.length} students`);
}

function resetAllPayments(){

  const confirmReset = confirm(
    "WARNING: Delete ALL payment records?"
  );

  if(!confirmReset) return;

  students.forEach(student => {
    student.payments = [];
  });

  save();
  render();

  console.log("All payments reset successfully.");
}

function skipWeek(week){

  week = Number(week);

  if(!week || skippedWeeks.includes(week))
    return;

  skippedWeeks.push(week);

  save();

  render();
  renderCalendar();
}

function isSkipped(week){
  return skippedWeeks.includes(week);
}

function unskipWeek(week){

  week = Number(week);

  skippedWeeks = skippedWeeks.filter(
    w => w !== week
  );

  save();

  render();
  renderCalendar();

  console.log("Unskipped week:", week);
}

  




function copyReport(){

  if(!students) return;

  const cur = getCurrentWeek();

  let totalCollected = 0;

  // Compute expected/remaining (keep existing logic)
  let validWeeks = 0;
  for(let i = 1; i <= cur; i++){
    if(!isSkipped(i)) validWeeks++;
  }
  const expected = validWeeks * WEEKLY_FEE * students.length;
  const remaining = expected - totalCollected;

  // Sort students alphabetically
  const sorted = (students || []).slice().sort((a,b)=>{
    const na = (a?.name || "").toLowerCase();
    const nb = (b?.name || "").toLowerCase();
    if(na < nb) return -1;
    if(na > nb) return 1;
    return 0;
  });

  let updatedCount = 0;
  let debtCount = 0;
  let advancedCount = 0;

  let studentStatusSection = `\r\n📋 STUDENT PAYMENT STATUS\r\n`;

  sorted.forEach(s => {
    const totalPaid = getTotal(s);
    const weeks = getWeeks(totalPaid);
    const debt = getDebt(weeks);

    totalCollected += totalPaid;

    let statusIcon = "";
    let statusLabel = "";

    // Status priority (confirmed by user)
    if(weeks > cur){
      statusIcon = "⭐";
      statusLabel = "ADVANCED";
      advancedCount++;
    }else if(debt > 0){
      statusIcon = "🔴";
      statusLabel = "WITH DEBT";
      debtCount++;
    }else{
      // debt === 0
      if(weeks >= cur){
        statusIcon = "🟢";
        statusLabel = "UPDATED";
      }else{
        // Not in rules explicitly, but keep it deterministic for display.
        statusIcon = "🟢";
        statusLabel = "UPDATED";
      }
      updatedCount++;
    }

    studentStatusSection += `\r\n${statusIcon} ${s.name}\r\nPaid: ₱${totalPaid}\r\nWeeks: ${weeks}\r\nDebt: ₱${debt}\r\n`;
  });

  const remainingAfterCollected = expected - totalCollected;

  const expensesTotal = getTotalExpenses();
  const netBalance = totalCollected - expensesTotal;

  const expensesSectionParts = [];
  if(expenses && expenses.length){
    expenses
      .slice()
      .sort((a,b)=> new Date(b.date) - new Date(a.date))
      .forEach(expense => {
        const title = expense.title || "";
        const amt = toNumber(expense.amount);
        expensesSectionParts.push(`• ${title} - ₱${amt}`);
      });
  }

  const expensesList = expensesSectionParts.length
    ? expensesSectionParts.join("\r\n")
    : "• No expenses recorded";

  const report = `
CLASS FUND REPORT

Current Week: ${cur}
Students: ${students.length}

Total Collected: ₱${totalCollected}
Expected: ₱${expected}
Remaining: ₱${remainingAfterCollected}

Updated: ${updatedCount}
With Debt: ${debtCount}
Advanced: ${advancedCount}

${studentStatusSection}

SUMMARY
🟢 Updated: ${updatedCount}
🔴 With Debt: ${debtCount}
⭐ Advanced: ${advancedCount}

EXPENSES SUMMARY
Total Expenses: ₱${expensesTotal}
Net Balance: ₱${netBalance}

EXPENSE LIST
${expensesList}

Generated: ${new Date().toLocaleString()}
`;

  navigator.clipboard.writeText(report)
    .then(()=> alert("nakopya na po. salamat ha :D"))
    .catch(()=> alert("Copy failed"));
}

// ================= NEW FEATURE: SHORT WEEKLY REPORT =================
function showToast(message, type){
  const container = $("toastContainer");
  if(!container){
    alert(message);
    return;
  }

  const toast = document.createElement("div");
  toast.className = "toast toast-" + (type || "success");

  const iconText =
    type === "error" ? "!" : "✓";

  toast.innerHTML = `
    <div class="toast-icon" aria-hidden="true">${iconText}</div>
    <div class="toast-msg">${message}</div>
  `;

  container.appendChild(toast);

  // Remove after animation duration (matches CSS 0.24 + 0.28 + delay)
  const totalMs = 2400;
  setTimeout(()=>{
    try{
      toast.classList.add("show-hide");
      setTimeout(()=>{
        toast.remove();
      }, 310);
    }catch{
      toast.remove();
    }
  }, 2000);
}

function copyShortReport(){

  if(!students) return;

  const cur = getCurrentWeek();
  const generated = new Date().toLocaleString();

  let totalCollected = 0;

  let validWeeks = 0;
  for(let i = 1; i <= cur; i++){
    if(!isSkipped(i)) validWeeks++;
  }

  const expected = validWeeks * WEEKLY_FEE * students.length;

  const sorted = (students || []).slice().sort((a,b)=>{
    const na = (a?.name || "").toLowerCase();
    const nb = (b?.name || "").toLowerCase();
    if(na < nb) return -1;
    if(na > nb) return 1;
    return 0;
  });

  let updatedCount = 0;
  let debtCount = 0;
  let advancedCount = 0;

  sorted.forEach(s => {
    const totalPaid = getTotal(s);
    const weeks = getWeeks(totalPaid);
    const debt = getDebt(weeks);

    totalCollected += totalPaid;

    // Keep consistent with existing copyReport logic for these counts.
    if(weeks > cur){
      advancedCount++;
    }else if(debt > 0){
      debtCount++;
    }else{
      updatedCount++;
    }
  });

  const remaining = expected - totalCollected;

  const totalExpenses = getTotalExpenses();
  const netBalance = totalCollected - totalExpenses;

  const report = `📊 CLASS FUND UPDATE
Week: ${cur}

✅ Updated: ${updatedCount}
🔴 With Debt: ${debtCount}
⭐ Advanced: ${advancedCount}

💰 Collected: ₱${totalCollected}
📉 Remaining: ₱${remaining}
💸 Expenses: ₱${totalExpenses}
🏦 Net Balance: ₱${netBalance}

Generated: ${generated}`;

  navigator.clipboard.writeText(report)
    .then(()=>{
      showToast("Short report copied!", "success");
    })
    .catch(()=> alert("Copy failed"));
}

// ================= NEW FEATURE: ONE-CLICK GC REMINDER =================
function copyGCReminder(){

  if(!students) return;

  const cur = getCurrentWeek();
  const generated = new Date().toLocaleString();

  let paidNames = [];
  let unpaidNames = [];

  let updatedCount = 0; // PAID count per rule
  let debtCount = 0;     // UNPAID count per rule

  const sorted = (students || []).slice().sort((a,b)=>{
    const na = (a?.name || "").toLowerCase();
    const nb = (b?.name || "").toLowerCase();
    if(na < nb) return -1;
    if(na > nb) return 1;
    return 0;
  });

  sorted.forEach(s => {
    const totalPaid = getTotal(s);
    const weeks = getWeeks(totalPaid);
    const debt = getDebt(weeks);

    if(debt === 0){
      paidNames.push(s.name);
      updatedCount++;
    }else if(debt > 0){
      unpaidNames.push(s.name);
      debtCount++;
    }else{
      // debt should never be negative, but keep deterministic fallback
      paidNames.push(s.name);
      updatedCount++;
    }
  });

  // Ensure alphabetical ordering within each group (rule)
  paidNames = paidNames.slice().sort((a,b)=>{
    const na = (a || "").toLowerCase();
    const nb = (b || "").toLowerCase();
    if(na < nb) return -1;
    if(na > nb) return 1;
    return 0;
  });

  unpaidNames = unpaidNames.slice().sort((a,b)=>{
    const na = (a || "").toLowerCase();
    const nb = (b || "").toLowerCase();
    if(na < nb) return -1;
    if(na > nb) return 1;
    return 0;
  });

  const paidList = paidNames.length
    ? paidNames.map(n => `- ${n}`).join("\n")
    : "- (None)";

  const unpaidList = unpaidNames.length
    ? unpaidNames.map(n => `- ${n}`).join("\n")
    : "- (None)";

  const reminder = `📢 CLASS FUND REMINDER

Week ${cur} Collection

✅ PAID (${updatedCount})
${paidList}

🔴 UNPAID (${debtCount})
${unpaidList}

Please settle your class fund contribution as soon as possible.

Thank you! 😊`;

  navigator.clipboard.writeText(reminder)
    .then(()=>{
      showToast("GC reminder copied!", "success");
    })
    .catch(()=> alert("Copy failed"));
}


function exportBackup(){

  const data = {
    students: students || [],
    startDate: startDate || null,
    skippedWeeks: skippedWeeks || [],
    archives: archives || [],
    paymentHistory: paymentHistory || [],
    expenses: expenses || [],
    currentMonth: localStorage.getItem("currentMonth") || null,
    exportedAt: new Date().toISOString(),
    app: "class-fund-auditor"
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "class-fund-backup.json";
  a.click();

  URL.revokeObjectURL(url);
}

function importBackup(event){
  const file = event.target.files?.[0];

  if(!file) return;

  const confirmed = confirm(
    "Import this backup? This will replace the current data saved in this browser."
  );

  if(!confirmed){
    event.target.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = function(){
    try{
      const data = JSON.parse(reader.result);

      if(!Array.isArray(data.students)){
        throw new Error("Backup is missing students data.");
      }

      students = data.students || [];
      startDate = data.startDate || null;
      skippedWeeks = Array.isArray(data.skippedWeeks)
        ? data.skippedWeeks
        : [];
      archives = Array.isArray(data.archives)
        ? data.archives
        : [];
      paymentHistory = Array.isArray(data.paymentHistory)
        ? data.paymentHistory
        : [];
      expenses = Array.isArray(data.expenses)
        ? data.expenses
        : [];
      lastImportedStudentIds = [];

      localStorage.setItem("students", JSON.stringify(students));
      localStorage.setItem("startDate", startDate || "");
      localStorage.setItem("skippedWeeks", JSON.stringify(skippedWeeks));
      localStorage.setItem("archives", JSON.stringify(archives));
      localStorage.setItem("paymentHistory", JSON.stringify(paymentHistory));
      localStorage.setItem("expenses", JSON.stringify(expenses));
      localStorage.setItem("lastImportedStudentIds", JSON.stringify([]));

      if(data.currentMonth){
        localStorage.setItem("currentMonth", data.currentMonth);
      }

      if($("startDate")){
        $("startDate").value = startDate || "";
      }

      render();
      renderCalendar();
      renderArchive();
      renderHistory();
      renderExpenses();

      if(typeof renderAnalytics === "function"){
        renderAnalytics();
      }

      alert("Backup imported successfully.");
    }catch(error){
      console.error(error);
      alert("Could not import this backup. Please choose a valid class-fund backup JSON file.");
    }finally{
      event.target.value = "";
    }
  };

  reader.readAsText(file);
}

function animateVisibleUi(){
  const activePage = document.querySelector(".page.active");
  if(!activePage) return;

  // Re-trigger CSS animation by toggling a class on key containers.
  // (No changes to business logic—UI-only)
  const header = activePage.querySelector(".page-header");
  if(header){
    header.classList.remove("ui-animate");
    // force reflow
    // eslint-disable-next-line no-unused-expressions
    header.offsetHeight;
    header.classList.add("ui-animate");
  }
}

function showPage(page){

  document.querySelectorAll(".page").forEach(p=>{
    p.classList.remove("active");
  });

  const selectedPage =
  document.getElementById("page-" + page);

  if(selectedPage){
    selectedPage.classList.add("active");
  }

  document.querySelectorAll(".nav-btn").forEach(btn=>{
    btn.classList.remove("active");
  });

  if(page === "history"){
    renderHistory();
  }

  if(page === "archive"){
    renderArchive();
  }

  if(page === "analytics"){
    renderAnalytics();
  }

  if(page === "expenses"){
    renderExpenses();
  }

  // UI-only animation trigger
  animateVisibleUi();
}



function renderCalendar(){

  const container = $("calendarWeeks");

  if(!container) return;

  if(!startDate){

    container.innerHTML = `
      <p>
        Select a first collection date first.
      </p>
    `;

    return;
  }

  const start = new Date(startDate);

  let html = "";

  for(let i=1;i<=5;i++){

    const weekStart = new Date(start);
    weekStart.setDate(
      start.getDate() + ((i-1)*7)
    );

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(
      weekStart.getDate() + 4
    );

    html += `
<div class="card">

  <strong>
    Week ${i}
  </strong>

  <br>

  ${weekStart.toLocaleDateString()}
  -
  ${weekEnd.toLocaleDateString()}

  <br><br>

  <span>
    ${
      isSkipped(i)
      ? "🚫 Skipped"
      : "✅ Active"
    }
  </span>

  <br><br>

  ${
    isSkipped(i)
    ?
    `<button onclick="unskipWeek(${i})">
      Remove Skip
    </button>`
    :
    `<button onclick="skipWeek(${i})">
      Skip Week
    </button>`
  }

</div>
`;
  }

  container.innerHTML = html;
}


function saveArchive(){

  const today = new Date();

  const monthKey =
  today.toLocaleString("en-US",{
    month:"long",
    year:"numeric"
  });

  const totalCollected = students.reduce(
    (sum,s)=>sum+getTotal(s),
    0
  );

  const archive = {
    month: monthKey,
    collected: totalCollected,
    eventFund: totalCollected * 0.70,
    reserveFund: totalCollected * 0.30,
    students: students.length,
    date: new Date().toLocaleString()
  };

  const existing =
  archives.find(a=>a.month===monthKey);

  if(existing){

    existing.collected =
    archive.collected;

    existing.eventFund =
    archive.eventFund;

    existing.reserveFund =
    archive.reserveFund;

    existing.students =
    archive.students;

    existing.date =
    archive.date;

  }else{

    archives.push(archive);

  }

  localStorage.setItem(
    "archives",
    JSON.stringify(archives)
  );

}

function renderArchive(){

  const container =
  document.getElementById("archiveContainer");

  if(!container) return;

  container.innerHTML = "";

  if(archives.length === 0){

    container.innerHTML = `
      <div class="card">
        No archived months yet.
      </div>
    `;

    return;
  }

  archives
  .slice()
  .reverse()
  .forEach(a=>{

    container.innerHTML += `
      <div class="card">
        <h3>${a.month}</h3>

        <p>💰 Collected: ₱${a.collected}</p>
        <p>🎉 Event Fund: ₱${a.eventFund}</p>
        <p>🏦 Reserve Fund: ₱${a.reserveFund}</p>
        <p>👥 Students: ${a.students}</p>

        <small>${a.date}</small>
      </div>
    `;
  });

}


function renderHistory(){

  const container =
  $("historyContainer");

  if(!container) return;

  const search =
  ($("historySearch")?.value || "")
  .toLowerCase();

  let html = "";

  paymentHistory.forEach(record=>{

    if(
      !record.student
      .toLowerCase()
      .includes(search)
    ) return;

    html += `
    <div class="card">

      <strong>
        ${record.student}
      </strong>

      <p>
        💰 ₱${record.amount}
      </p>

      <p>
        📅 ${record.date}
      </p>

      <p>
        📁 ${record.month}
      </p>

    </div>
    `;
  });

  container.innerHTML =
  html ||
  `<div class="card">
    No payment records found.
  </div>`;
}

function checkMonthReset(){

  const currentMonth =
  new Date().toLocaleString("en-US",{
    month:"long",
    year:"numeric"
  });

  const savedMonth =
  localStorage.getItem("currentMonth");

  if(!savedMonth){

    localStorage.setItem(
      "currentMonth",
      currentMonth
    );

    return;
  }

  if(savedMonth === currentMonth){
    return;
  }

  // Save old payments to permanent history
  students.forEach(student=>{

    student.payments.forEach(payment=>{

      paymentHistory.push({

        student: student.name,

        amount: payment.amount,

        date: payment.date,

        month:
        payment.month ||
        savedMonth

      });

    });

    // Reset monthly payments
    student.payments = [];

  });

  skippedWeeks = [];

  localStorage.setItem(
    "paymentHistory",
    JSON.stringify(paymentHistory)
  );

  localStorage.setItem(
    "skippedWeeks",
    JSON.stringify([])
  );

  localStorage.setItem(
    "currentMonth",
    currentMonth
  );

  save();

  alert(
    "New month detected. Monthly collections have been reset."
  );
}
function viewStudent(id){

  const student =
  students.find(s => s.id === id);

  if(!student) return;

  const total =
  getTotal(student);

  const weeks =
  getWeeks(total);

  const debt =
  getDebt(weeks);

  let payments = "";

  student.payments.forEach(p=>{

    payments += `
      <li>
        ₱${p.amount}
        -
        ${p.date}
      </li>
    `;

  });

  $("studentInfo").innerHTML = `
    <h2>${student.name}</h2>

    <p>
      💰 Total Paid:
      ₱${total}
    </p>

    <p>
      📅 Weeks Covered:
      ${weeks}
    </p>

    <p>
      ⚠ Debt:
      ₱${debt}
    </p>

    <h3>Payments</h3>

    <ul>
      ${payments || "<li>No payments yet</li>"}
    </ul>
  `;

  $("studentModal").style.display =
  "flex";
}

function closeModal(){

  $("studentModal").style.display =
  "none";

}
// ================= INIT =================
window.onload = () => {

  if($("startDate")){
    $("startDate").value = startDate || "";
  }

  renderHistory();
  renderSelect();
  renderCalendar();
  renderArchive();
  renderAnalytics();
  checkMonthReset();
  render();

  // Bind Excel export safe wrapper (must exist after scripts load)
  if(typeof window.exportExcelBackup === "function"){
    window.exportExcelBackupSafe = window.exportExcelBackupSafe;
  }

  render();

  showPage("dashboard");
};

// Excel export wrapper with error handling + success notification.
// This wrapper is the only part that UI will call.
function exportExcelBackupSafe(){
  try{
    if(typeof window.exportExcelBackup !== "function"){
      alert("Excel export failed: export function not available.");
      return;
    }

    const provider = window.localStorageExcelDataProvider;
    if(!provider){
      alert("Excel export failed: data provider not found.");
      return;
    }

    exportExcelBackup(provider)
      .then(()=>{
        alert("Excel backup exported successfully.");
      })
      .catch((err)=>{
        console.error(err);
        alert("Excel export failed: " + (err?.message || String(err)));
      });
  }catch(err){
    console.error(err);
    alert("Excel export failed: " + (err?.message || String(err)));
  }
}

console.log("Students Loaded:", students);

