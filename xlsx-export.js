// Offline Excel export helper for Class Fund Auditor.
// Uses SheetJS (xlsx) which must be loaded globally as `XLSX`.

(function () {
  function toNumber(v) {
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  }

  function safeString(v) {
    if (v === null || v === undefined) return "";
    return String(v);
  }

  function formatMoneyPHP(n) {
    // Keep as number for Excel; UI formatting handled by Excel.
    return toNumber(n);
  }

  function getCurrentWeekFromProvider(provider) {
    try {
      return provider.getCurrentWeek();
    } catch {
      return 1;
    }
  }

  function getStudentStatus(weeks, debt, cur) {
    // Priority (confirmed):
    // 1) ⭐ ADVANCED if weeks > cur
    // 2) 🔴 WITH DEBT if debt > 0
    // 3) 🟢 UPDATED if debt === 0 and weeks >= cur
    if (weeks > cur) return { label: "Advanced", icon: "⭐" };
    if (debt > 0) return { label: "With Debt", icon: "🔴" };
    // debt === 0
    if (weeks >= cur) return { label: "Updated", icon: "🟢" };
    return { label: "Updated", icon: "🟢" };
  }

  async function exportExcelBackup(dataProvider) {
    if (typeof XLSX === "undefined") {
      throw new Error("SheetJS (XLSX) is not loaded.");
    }

    if (!dataProvider || typeof dataProvider.getAllData !== "function") {
      throw new Error("Missing data provider for Excel export.");
    }

    const data = dataProvider.getAllData();


    const students = Array.isArray(data.students) ? data.students : [];
    const paymentHistory = Array.isArray(data.paymentHistory) ? data.paymentHistory : [];
    const expenses = Array.isArray(data.expenses) ? data.expenses : [];
    const archives = Array.isArray(data.archives) ? data.archives : [];
    const skippedWeeks = Array.isArray(data.skippedWeeks) ? data.skippedWeeks : [];

    const cur = getCurrentWeekFromProvider({ getCurrentWeek: dataProvider.getCurrentWeek.bind(dataProvider) });

    const WEEKLY_FEE = dataProvider.getWeeklyFee ? dataProvider.getWeeklyFee() : 5;

    function isSkipped(week) {
      return skippedWeeks.includes(week);
    }

    function getWeeksCovered(totalPaid) {
      // Mirrors app logic: weeks = Math.floor(totalPaid / WEEKLY_FEE)
      return Math.floor(toNumber(totalPaid) / WEEKLY_FEE);
    }

    function getDebt(weeks) {
      // Mirrors app logic: debtWeeks = validWeeks - weeks; debt = max(0, debtWeeks*WEEKLY_FEE)
      let validWeeks = 0;
      for (let i = 1; i <= cur; i++) {
        if (!isSkipped(i)) validWeeks++;
      }
      const debtWeeks = validWeeks - toNumber(weeks);
      return Math.max(0, debtWeeks * WEEKLY_FEE);
    }

    function getTotalPaidForStudent(s) {
      const payments = Array.isArray(s.payments) ? s.payments : [];
      return payments.reduce((sum, p) => sum + toNumber(p.amount), 0);
    }

    // ===== Workbook + sheets =====
    const wb = XLSX.utils.book_new();

    // Sheet 1: Students
    const studentRows = [];
    const studentsSorted = students
      .slice()
      .sort((a, b) => {
        const na = safeString(a.name).toLowerCase();
        const nb = safeString(b.name).toLowerCase();
        if (na < nb) return -1;
        if (na > nb) return 1;
        return 0;
      });

    let totalPaidAll = 0;
    let totalDebtAll = 0;

    for (const s of studentsSorted) {
      const totalPaid = getTotalPaidForStudent(s);
      const weeks = getWeeksCovered(totalPaid);
      const debt = getDebt(weeks);
      const status = getStudentStatus(weeks, debt, cur);

      totalPaidAll += toNumber(totalPaid);
      totalDebtAll += toNumber(debt);

      studentRows.push({
        "Student Name": safeString(s.name),
        "Username": safeString(s.username),
        "Total Paid": formatMoneyPHP(totalPaid),
        "Weeks Covered": weeks,
        "Current Debt": formatMoneyPHP(debt),
        "Status (Updated / With Debt)": status.label
      });
    }

    // Totals bottom
    studentRows.push({
      "Student Name": "TOTALS",
      "Username": "",
      "Total Paid": formatMoneyPHP(totalPaidAll),
      "Weeks Covered": "",
      "Current Debt": formatMoneyPHP(totalDebtAll),
      "Status (Updated / With Debt)": ""
    });

    const wsStudents = XLSX.utils.json_to_sheet(studentRows, { skipHeader: false });
    XLSX.utils.book_append_sheet(wb, wsStudents, "Students");

    // Sheet 2: Payments
    // paymentHistory already contains records from all students in monthly history in this app.
    // Additionally, current student.payments are stored in local students.
    // Requirement: include all payment records from all students.
    const paymentsRows = [];

    // From current students.payments
    for (const s of students) {
      const studentName = safeString(s.name);
      const payments = Array.isArray(s.payments) ? s.payments : [];
      for (const p of payments) {
        paymentsRows.push({
          "Student": studentName,
          "Amount": formatMoneyPHP(p.amount),
          "Date": safeString(p.date),
          "Month": safeString(p.month)
        });
      }
    }

    // From archived paymentHistory
    for (const r of paymentHistory) {
      paymentsRows.push({
        "Student": safeString(r.student),
        "Amount": formatMoneyPHP(r.amount),
        "Date": safeString(r.date),
        "Month": safeString(r.month)
      });
    }

    // Optional: totals for payments? Requirements didn't ask.
    const wsPayments = XLSX.utils.json_to_sheet(paymentsRows, { skipHeader: false });
    XLSX.utils.book_append_sheet(wb, wsPayments, "Payments");

    // Sheet 3: Expenses
    const expenseRows = [];
    let totalExpensesAll = 0;

    const expensesSorted = expenses
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    for (const e of expensesSorted) {
      const amt = toNumber(e.amount);
      totalExpensesAll += amt;
      expenseRows.push({
        "Date": safeString(e.date),
        "Title": safeString(e.title),
        "Amount": formatMoneyPHP(amt)
      });
    }

    expenseRows.push({
      "Date": "TOTALS",
      "Title": "",
      "Amount": formatMoneyPHP(totalExpensesAll)
    });

    const wsExpenses = XLSX.utils.json_to_sheet(expenseRows, { skipHeader: false });
    XLSX.utils.book_append_sheet(wb, wsExpenses, "Expenses");

    // Sheet 4: Monthly Archives
    const archiveRows = [];
    for (const a of (Array.isArray(archives) ? archives : [])) {
      archiveRows.push({
        "Month": safeString(a.month),
        "Collected": formatMoneyPHP(a.collected),
        "Event Fund": formatMoneyPHP(a.eventFund),
        "Reserve Fund": formatMoneyPHP(a.reserveFund),
        "Students": safeString(a.students),
        "Date Archived": safeString(a.date)
      });
    }
    const wsArchives = XLSX.utils.json_to_sheet(archiveRows, { skipHeader: false });
    XLSX.utils.book_append_sheet(wb, wsArchives, "Monthly Archives");

    // Sheet 5: Summary
    const totalStudents = students.length;
    const totalCollected = students.reduce((sum, s) => sum + getTotalPaidForStudent(s), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + toNumber(e.amount), 0);
    const netBalance = totalCollected - totalExpenses;
    const eventFund = totalCollected * 0.7;
    const reserveFund = totalCollected * 0.3;
    const startDate = safeString(data.startDate);
    const generatedDate = new Date();

    const wsSummary = XLSX.utils.json_to_sheet([
      { "Total Students": totalStudents },
      { "Total Collected": formatMoneyPHP(totalCollected) },
      { "Total Expenses": formatMoneyPHP(totalExpenses) },
      { "Net Balance": formatMoneyPHP(netBalance) },
      { "Event Fund": formatMoneyPHP(eventFund) },
      { "Reserve Fund": formatMoneyPHP(reserveFund) },
      { "Current Week": cur },
      { "Start Date": startDate },
      { "Generated Date": generatedDate.toLocaleString() }
    ], { skipHeader: false });

    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    // Filename
    const y = generatedDate.getFullYear();
    const m = String(generatedDate.getMonth() + 1).padStart(2, "0");
    const d = String(generatedDate.getDate()).padStart(2, "0");

    const filename = `class-fund-backup-${y}-${m}-${d}.xlsx`;

    // Save
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });

    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Expose globally
  window.exportExcelBackup = exportExcelBackup;
})();

