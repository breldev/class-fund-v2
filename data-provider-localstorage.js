// Data provider layer for Excel export.
// Offline only.
// Swap this file later with a Firebase/Firestore provider without touching export logic.

(function () {
  function getAllData() {
    let students = [];
    let paymentHistory = [];
    let expenses = [];
    let archives = [];
    let skippedWeeks = [];
    let startDate = null;

    try {
      students = JSON.parse(localStorage.getItem("students")) || [];
    } catch {}

    try {
      paymentHistory = JSON.parse(localStorage.getItem("paymentHistory")) || [];
    } catch {}

    try {
      expenses = JSON.parse(localStorage.getItem("expenses")) || [];
    } catch {}

    try {
      archives = JSON.parse(localStorage.getItem("archives")) || [];
    } catch {}

    try {
      skippedWeeks = JSON.parse(localStorage.getItem("skippedWeeks")) || [];
    } catch {}

    try {
      startDate = localStorage.getItem("startDate") || null;
    } catch {}

    return {
      students,
      paymentHistory,
      expenses,
      archives,
      skippedWeeks,
      startDate,
    };
  }

  const localStorageDataProvider = {
    getAllData,
    // Provide app-calculation helpers used by xlsx-export.js
    getCurrentWeek: function () {
      // Mirrors app.js getCurrentWeek() logic
      let startDate = null;
      try {
        startDate = localStorage.getItem("startDate") || null;
      } catch {
        startDate = null;
      }

      const WEEKLY_FEE = 5;
      if (!startDate) return 1;

      const start = new Date(startDate);
      const today = new Date();

      start.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);

      let weekdays = 0;
      const current = new Date(start);

      while (current <= today) {
        const day = current.getDay();
        if (day !== 0 && day !== 6) {
          weekdays++;
        }
        current.setDate(current.getDate() + 1);
      }

      return Math.max(1, Math.ceil(weekdays / 5));
    },
    getWeeklyFee: function () {
      return 5;
    },
  };

  window.localStorageExcelDataProvider = localStorageDataProvider;
})();

