/* =====================================================================
   API BRIDGE — talks to the Google Apps Script Web App (deployed as a
   JSON API) instead of using google.script.run, so this file can run
   as a plain static site (GitHub Pages + custom domain) while Google
   Sheets stays the database. Everything below this block is completely
   unchanged from the original app — it still calls
   google.script.run.withSuccessHandler(...).someFunction(args), it's
   just that "google.script.run" is now this shim instead of the real
   Apps Script bridge.
   ===================================================================== */

// PASTE your deployed Apps Script Web App URL here (ends in /exec).
// See DEPLOY_INSTRUCTIONS.md for how to get this.
var API_URL = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';

var API_WRITE_ACTIONS = [
  'addTransaction', 'updateTransaction', 'deleteTransaction',
  'addCategory', 'deleteCategory', 'renameCategory',
  'setCurrency', 'setLanguage'
];
var API_ALL_ACTIONS = API_WRITE_ACTIONS.concat([
  'getSettings', 'getCategories', 'getMonthsList',
  'getTransactions', 'searchTransactions', 'getDashboard'
]);

function apiCall_(action, args) {
  var isWrite = API_WRITE_ACTIONS.indexOf(action) !== -1;
  var req = isWrite
    ? fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids a CORS preflight
        body: JSON.stringify({ action: action, args: args })
      })
    : fetch(API_URL + '?action=' + encodeURIComponent(action) + '&args=' + encodeURIComponent(JSON.stringify(args)));

  return req.then(function (res) { return res.json(); }).then(function (data) {
    if (data && data.error) throw new Error(data.error);
    return data.result;
  });
}

/** Mimics google.script.run's chainable API exactly, so nothing below has to change. */
function makeScriptRunner_() {
  var onSuccess = null, onFailure = null;
  var runner = {
    withSuccessHandler: function (fn) { onSuccess = fn; return runner; },
    withFailureHandler: function (fn) { onFailure = fn; return runner; }
  };
  API_ALL_ACTIONS.forEach(function (action) {
    runner[action] = function () {
      apiCall_(action, Array.prototype.slice.call(arguments))
        .then(function (result) { if (onSuccess) onSuccess(result); })
        .catch(function (err) { if (onFailure) onFailure({ message: err.message || String(err) }); });
    };
  });
  return runner;
}

// "google.script.run" is accessed fresh each time (a getter), exactly like the real thing.
var google = { script: { get run() { return makeScriptRunner_(); } } };

/* =====================================================================
   LOCK SCREEN
   ===================================================================== */

var APP_PASSKEY = '1234'; // change this to your own 4-digit passkey
var enteredPin = '';

function initLockScreen() {
  document.getElementById('openKeypadBtn').addEventListener('click', openKeypad);
  document.getElementById('closeKeypad').addEventListener('click', closeKeypad);
  document.getElementById('keypadModal').addEventListener('click', function (e) {
    if (e.target.id === 'keypadModal') closeKeypad();
  });
  document.querySelectorAll('.key-btn[data-num]').forEach(function (btn) {
    btn.addEventListener('click', function () { pressDigit(btn.dataset.num); });
  });
  document.getElementById('pinBackspace').addEventListener('click', function () {
    enteredPin = enteredPin.slice(0, -1);
    document.getElementById('pinError').classList.remove('show');
    updatePinDots();
  });
}

function openKeypad() {
  enteredPin = '';
  updatePinDots();
  document.getElementById('pinError').classList.remove('show');
  document.getElementById('keypadModal').classList.add('show');
}

function closeKeypad() {
  document.getElementById('keypadModal').classList.remove('show');
}

function pressDigit(d) {
  if (enteredPin.length >= 4) return;
  enteredPin += d;
  updatePinDots();
  if (enteredPin.length === 4) setTimeout(checkPin, 150);
}

function updatePinDots() {
  document.querySelectorAll('.pin-dot').forEach(function (dot, i) {
    dot.classList.toggle('filled', i < enteredPin.length);
  });
}

function checkPin() {
  if (enteredPin === APP_PASSKEY) {
    unlockApp();
    return;
  }
  document.getElementById('pinError').classList.add('show');
  var card = document.getElementById('keypadCard');
  card.classList.add('shake');
  setTimeout(function () {
    card.classList.remove('shake');
    enteredPin = '';
    updatePinDots();
  }, 420);
}

function unlockApp() {
  document.getElementById('keypadModal').classList.remove('show');
  var lock = document.getElementById('lockScreen');
  lock.classList.add('unlocking');
  setTimeout(function () {
    lock.style.display = 'none';
    document.getElementById('appShell').style.display = '';
    init();
  }, 350);
}

document.addEventListener('DOMContentLoaded', initLockScreen);

/* =====================================================================
   MAIN APP (unchanged) — starts only after a correct passkey is entered
   ===================================================================== */

  var state = {

    month: null,
    months: [],
    categories: { income: [], expense: [] },
    txFilter: 'All',
    chartType: 'Expense',
    type: 'Expense',
    currencySymbol: '€',
    currencyCode: 'EUR',
    languageCode: 'en',
    searchQuery: '',
    editingId: null,
    txIndex: {}
  };

  var COLORS = ['#0A4174', '#4E8EA2', '#6EA2B3', '#7BBDE8', '#49769F', '#001D39', '#BDD8E9', '#C0455A'];

  var I18N = {
    en: {
      appTitle: 'Daily Expense Tracker',
      navDashboard: 'Dashboard', navTransactions: 'Transactions', navCategories: 'Categories',
      totalBalance: 'Total Balance', previousBalance: 'Previous Balance', monthBalance: "This Month's Balance",
      income: 'Income', expense: 'Expense',
      categoryBreakdown: 'Category Breakdown', recentActivity: 'Recent Activity',
      showMore: 'View All Categories', showLess: 'Show Less',
      filterAll: 'All', filterDaily: 'Daily', filterWeekly: 'Weekly', filterMonthly: 'Monthly', filterYearly: 'Yearly',
      searchPlaceholder: 'Search category, note, date…',
      noChartData: 'No data yet for this month.',
      noRecentTx: 'No transactions yet this month.',
      noFilterTx: 'No transactions match this filter.',
      noSearchResults: 'No matches found.',
      fieldAmount: 'Amount', fieldCategory: 'Category', fieldPayment: 'Payment Method',
      fieldDate: 'Date', fieldNotes: 'Notes (optional)',
      notesPlaceholder: 'e.g. Lunch with friends',
      addTransaction: 'Add Transaction', adding: 'Adding…',
      payCash: 'Cash', payBank: 'Bank Transfer', payCard: 'Card', payMobile: 'Mobile Banking', payOther: 'Other',
      expenseCategories: 'Expense Categories', incomeCategories: 'Income Categories',
      newExpenseCat: 'New expense category', newIncomeCat: 'New income category', add: 'Add',
      settingsTitle: 'Settings', currencyLabel: 'Currency', languageLabel: 'Language',
      noCategoriesYet: 'No categories yet.', noCategorySelect: 'No categories — add one first',
      toastTxDeleted: 'Transaction deleted',
      toastIncomeAdded: 'Income added', toastExpenseAdded: 'Expense added',
      toastCategoryAdded: 'Category added', toastCategoryDeleted: 'Category deleted', toastCategoryUpdated: 'Category updated',
      toastCurrencyChanged: 'Currency changed', toastLanguageChanged: 'Language changed',
      errInvalidAmount: 'Enter a valid amount', errNoCategory: 'Add a category first', errNoDate: 'Pick a date',
      errGeneric: 'Something went wrong',
      confirmDeleteTx: 'Delete this transaction?', confirmDeleteCat: 'Delete "{name}"?',
      cancel: 'Cancel', confirmDeleteLabel: 'Delete',
      calculator: 'Calculator', useAmount: 'Use this amount',
      editingTx: 'Editing a transaction', updateTransaction: 'Update Transaction', updating: 'Updating…',
      toastTxUpdated: 'Transaction updated',
      appCredit: 'App developed by'
    },
    bn: {
      appTitle: 'ডেইলি এক্সপেন্স ট্র্যাকার',
      navDashboard: 'ড্যাশবোর্ড', navTransactions: 'লেনদেন', navCategories: 'ক্যাটাগরি',
      totalBalance: 'মোট ব্যালেন্স', previousBalance: 'পূর্ববর্তী ব্যালেন্স', monthBalance: 'এই মাসের ব্যালেন্স',
      income: 'আয়', expense: 'খরচ',
      categoryBreakdown: 'ক্যাটাগরি অনুযায়ী বিশ্লেষণ', recentActivity: 'সাম্প্রতিক কার্যক্রম',
      showMore: 'সব ক্যাটাগরি দেখুন', showLess: 'সংক্ষেপে দেখুন',
      filterAll: 'সব', filterDaily: 'দৈনিক', filterWeekly: 'সাপ্তাহিক', filterMonthly: 'মাসিক', filterYearly: 'বাৎসরিক',
      searchPlaceholder: 'ক্যাটাগরি, নোট, তারিখ খুঁজুন…',
      noChartData: 'এই মাসে এখনো কোনো ডেটা নেই।',
      noRecentTx: 'এই মাসে এখনো কোনো লেনদেন নেই।',
      noFilterTx: 'এই ফিল্টারে কোনো লেনদেন পাওয়া যায়নি।',
      noSearchResults: 'কিছু পাওয়া যায়নি।',
      fieldAmount: 'পরিমাণ', fieldCategory: 'ক্যাটাগরি', fieldPayment: 'পেমেন্ট মেথড',
      fieldDate: 'তারিখ', fieldNotes: 'নোট (ঐচ্ছিক)',
      notesPlaceholder: 'যেমন: বন্ধুদের সাথে দুপুরের খাবার',
      addTransaction: 'লেনদেন যোগ করুন', adding: 'যোগ হচ্ছে…',
      payCash: 'নগদ', payBank: 'ব্যাংক ট্রান্সফার', payCard: 'কার্ড', payMobile: 'মোবাইল ব্যাংকিং', payOther: 'অন্যান্য',
      expenseCategories: 'খরচের ক্যাটাগরি', incomeCategories: 'আয়ের ক্যাটাগরি',
      newExpenseCat: 'নতুন খরচের ক্যাটাগরি', newIncomeCat: 'নতুন আয়ের ক্যাটাগরি', add: 'যোগ করুন',
      settingsTitle: 'সেটিংস', currencyLabel: 'কারেন্সি', languageLabel: 'ভাষা',
      noCategoriesYet: 'এখনো কোনো ক্যাটাগরি নেই।', noCategorySelect: 'কোনো ক্যাটাগরি নেই — আগে একটি যোগ করুন',
      toastTxDeleted: 'লেনদেন মুছে ফেলা হয়েছে',
      toastIncomeAdded: 'আয় যোগ হয়েছে', toastExpenseAdded: 'খরচ যোগ হয়েছে',
      toastCategoryAdded: 'ক্যাটাগরি যোগ হয়েছে', toastCategoryDeleted: 'ক্যাটাগরি মুছে ফেলা হয়েছে', toastCategoryUpdated: 'ক্যাটাগরি আপডেট হয়েছে',
      toastCurrencyChanged: 'কারেন্সি পরিবর্তন হয়েছে', toastLanguageChanged: 'ভাষা পরিবর্তন হয়েছে',
      errInvalidAmount: 'সঠিক পরিমাণ লিখুন', errNoCategory: 'আগে একটি ক্যাটাগরি যোগ করুন', errNoDate: 'তারিখ নির্বাচন করুন',
      errGeneric: 'কিছু একটা সমস্যা হয়েছে',
      confirmDeleteTx: 'এই লেনদেনটি মুছে ফেলবেন?', confirmDeleteCat: '"{name}" মুছে ফেলবেন?',
      cancel: 'বাতিল', confirmDeleteLabel: 'মুছে ফেলুন',
      calculator: 'ক্যালকুলেটর', useAmount: 'এই পরিমাণ ব্যবহার করুন',
      editingTx: 'লেনদেন এডিট হচ্ছে', updateTransaction: 'লেনদেন আপডেট করুন', updating: 'আপডেট হচ্ছে…',
      toastTxUpdated: 'লেনদেন আপডেট হয়েছে',
      appCredit: 'অ্যাপটি তৈরি করেছেন'
    }
  };

  function tr(key) {
    var dict = I18N[state.languageCode] || I18N.en;
    return dict[key] !== undefined ? dict[key] : (I18N.en[key] || key);
  }

  // init() is called from unlockApp() once the correct passkey is entered — not on page load.

  function init() {
    document.getElementById('fDate').valueAsDate = new Date();
    bindNav();
    bindDashboard();
    bindTransactions();
    bindSearch();
    bindAddForm();
    bindCategories();
    bindSettings();
    bindConfirmModal();
    bindCalculator();
    bindCancelEdit();

    google.script.run.withSuccessHandler(onSettingsLoaded).getSettings();

    google.script.run.withSuccessHandler(function (months) {
      state.months = months;
      state.month = months[0];
      renderMonthSelect();
      google.script.run.withSuccessHandler(onCategoriesLoaded).getCategories();
      loadDashboard();
      loadTransactions();
    }).getMonthsList();
  }

  /* ---------------- Translations ---------------- */
  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = tr(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.setAttribute('placeholder', tr(el.getAttribute('data-i18n-ph')));
    });
    if (state.month) document.getElementById('monthLabel').textContent = monthLabel(state.month);
    if (state.months && state.months.length) renderMonthSelect();
    // Re-render dynamic lists so their empty-state / generated text matches the language
    populateCategorySelect();
    if (state.categories) renderCategoryLists();
    if (state.searchQuery) runSearch(); else loadTransactions();
    loadDashboard();
  }

  /* ---------------- Custom confirm modal (replaces window.confirm, which
     is unreliable inside Apps Script's sandboxed cross-origin iframe) ---------------- */
  var pendingConfirmCallback = null;

  function bindConfirmModal() {
    document.getElementById('confirmCancel').addEventListener('click', closeConfirm);
    document.getElementById('confirmOk').addEventListener('click', function () {
      var cb = pendingConfirmCallback;
      closeConfirm();
      if (cb) cb();
    });
    document.getElementById('confirmModal').addEventListener('click', function (e) {
      if (e.target.id === 'confirmModal') closeConfirm();
    });
  }

  function closeConfirm() {
    document.getElementById('confirmModal').classList.remove('show');
    pendingConfirmCallback = null;
  }

  function showConfirm(message, onConfirm) {
    document.getElementById('confirmMessage').textContent = message;
    pendingConfirmCallback = onConfirm;
    document.getElementById('confirmModal').classList.add('show');
  }

  /* ---------------- Calculator ---------------- */
  var calcExpr = '';

  function bindCalculator() {
    document.getElementById('calcBtn').addEventListener('click', function () {
      calcExpr = '';
      updateCalcDisplay();
      document.getElementById('calcModal').classList.add('show');
    });
    document.getElementById('closeCalc').addEventListener('click', function () {
      document.getElementById('calcModal').classList.remove('show');
    });
    document.getElementById('calcModal').addEventListener('click', function (e) {
      if (e.target.id === 'calcModal') e.currentTarget.classList.remove('show');
    });
    document.querySelectorAll('.calc-key').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.dataset.key;
        if (key === 'C') {
          calcExpr = '';
        } else if (key === '⌫') {
          calcExpr = calcExpr.slice(0, -1);
        } else if (key === '%') {
          var pr = evalExpr(calcExpr);
          if (pr !== null) calcExpr = String(trimNum(pr / 100));
        } else if (key === '=') {
          var r = evalExpr(calcExpr);
          if (r !== null) calcExpr = String(trimNum(r));
        } else {
          calcExpr += key;
        }
        updateCalcDisplay();
      });
    });
    document.getElementById('useCalcResult').addEventListener('click', function () {
      var r = evalExpr(calcExpr);
      if (r === null) { toast(tr('errInvalidAmount'), true); return; }
      document.getElementById('fAmount').value = trimNum(r);
      document.getElementById('calcModal').classList.remove('show');
    });
  }

  function updateCalcDisplay() {
    document.getElementById('calcExpr').textContent = calcExpr || '0';
    var r = evalExpr(calcExpr);
    document.getElementById('calcResult').innerHTML = (r !== null && calcExpr) ? '= ' + trimNum(r) : '&nbsp;';
  }

  /** Only digits/operators allowed — never passed to a general eval, safe from injection. */
  function evalExpr(expr) {
    if (!expr) return null;
    if (!/^[0-9+\-*/.\s]+$/.test(expr)) return null;
    if (/[+\-*/.]$/.test(expr.trim())) return null;
    try {
      var r = Function('"use strict"; return (' + expr + ')')();
      return (typeof r === 'number' && isFinite(r)) ? r : null;
    } catch (e) {
      return null;
    }
  }

  function trimNum(n) {
    return Math.round(n * 100) / 100;
  }

  /* ---------------- Settings ---------------- */
  function bindSettings() {
    document.getElementById('settingsBtn').addEventListener('click', function () {
      document.getElementById('settingsModal').classList.add('show');
    });
    document.getElementById('closeSettings').addEventListener('click', function () {
      document.getElementById('settingsModal').classList.remove('show');
    });
    document.getElementById('settingsModal').addEventListener('click', function (e) {
      if (e.target.id === 'settingsModal') e.currentTarget.classList.remove('show');
    });
  }

  function onSettingsLoaded(s) {
    state.currencySymbol = s.currencySymbol;
    state.currencyCode = s.currencyCode;
    state.currencyOptions = s.currencyOptions;
    state.languageCode = s.languageCode;
    state.languageOptions = s.languageOptions;
    renderCurrencyOptions();
    renderLanguageOptions();
    applyTranslations();
  }

  function renderCurrencyOptions() {
    var box = document.getElementById('currencyOptions');
    box.innerHTML = state.currencyOptions.map(function (o) {
      var sel = o.code === state.currencyCode ? ' selected' : '';
      return '<div class="currency-opt' + sel + '" data-code="' + o.code + '">' +
        '<span class="currency-symbol">' + o.symbol + '</span>' +
        '<span class="currency-name">' + o.label + '</span></div>';
    }).join('');

    box.querySelectorAll('.currency-opt').forEach(function (opt) {
      opt.addEventListener('click', function () {
        var code = opt.dataset.code;
        if (code === state.currencyCode) return;
        google.script.run.withSuccessHandler(function (s) {
          onSettingsLoaded(s);
          toast(tr('toastCurrencyChanged'));
        }).withFailureHandler(showErr).setCurrency(code);
      });
    });
  }

  function renderLanguageOptions() {
    var box = document.getElementById('languageOptions');
    box.innerHTML = state.languageOptions.map(function (o) {
      var sel = o.code === state.languageCode ? ' selected' : '';
      return '<div class="currency-opt' + sel + '" data-code="' + o.code + '">' +
        '<span class="currency-symbol">' + o.code.toUpperCase() + '</span>' +
        '<span class="currency-name">' + o.label + '</span></div>';
    }).join('');

    box.querySelectorAll('.currency-opt').forEach(function (opt) {
      opt.addEventListener('click', function () {
        var code = opt.dataset.code;
        if (code === state.languageCode) return;
        google.script.run.withSuccessHandler(function (s) {
          onSettingsLoaded(s);
          toast(tr('toastLanguageChanged'));
        }).withFailureHandler(showErr).setLanguage(code);
      });
    });
  }

  /* ---------------- Navigation ---------------- */
  function bindNav() {
    document.querySelectorAll('.nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.nav-btn').forEach(function (b) { b.classList.remove('active'); });
        document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('active');
        document.getElementById('page-' + btn.dataset.page).classList.add('active');
        if (btn.dataset.page === 'transactions') { if (state.searchQuery) runSearch(); else loadTransactions(); }
        if (btn.dataset.page === 'dashboard') loadDashboard();
      });
    });

    document.getElementById('monthSelect').addEventListener('change', function (e) {
      state.month = e.target.value;
      loadDashboard();
      if (!state.searchQuery) loadTransactions();
    });
  }

  function renderMonthSelect() {
    var sel = document.getElementById('monthSelect');
    sel.innerHTML = state.months.map(function (m) {
      return '<option value="' + m + '">' + monthLabel(m) + '</option>';
    }).join('');
    sel.value = state.month;
    document.getElementById('monthLabel').textContent = monthLabel(state.month);
  }

  function monthLabel(m) {
    var parts = m.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    var locale = state.languageCode === 'bn' ? 'bn-BD' : 'en-US';
    return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  }

  function money(n) {
    n = Number(n) || 0;
    return state.currencySymbol + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* ---------------- Dashboard ---------------- */
  function bindDashboard() {
    document.querySelectorAll('#chartToggle .seg-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('#chartToggle .seg-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.chartType = btn.dataset.type;
        loadDashboard();
      });
    });
  }

  function loadDashboard() {
    if (!state.month) return;
    document.getElementById('monthLabel').textContent = monthLabel(state.month);
    google.script.run.withSuccessHandler(renderDashboard).withFailureHandler(showErr).getDashboard(state.month);
  }

  function renderDashboard(d) {
    document.getElementById('totalBalance').textContent = money(d.totalBalance);
    document.getElementById('previousBalance').textContent = money(d.previousBalance);
    document.getElementById('monthBalance').textContent = money(d.balance);
    document.getElementById('incomeValue').textContent = money(d.income);
    document.getElementById('expenseValue').textContent = money(d.expense);

    try {
      var breakdown = state.chartType === 'Income' ? d.incomeByCategory : d.expenseByCategory;
      renderChart(breakdown);
    } catch (err) {
      document.getElementById('chartEmpty').style.display = 'block';
      document.getElementById('categoryChart').innerHTML = '';
    }

    var recentBox = document.getElementById('recentList');
    recentBox.innerHTML = d.recentTransactions.length
      ? d.recentTransactions.map(txRow).join('')
      : '<div class="empty-state">' + tr('noRecentTx') + '</div>';
    attachDeleteHandlers(recentBox, loadDashboard);
  }

  function renderChart(breakdown) {
    var wrap = document.getElementById('categoryChart');
    var empty = document.getElementById('chartEmpty');
    var legend = document.getElementById('chartLegend');

    if (!breakdown.length) {
      wrap.innerHTML = '';
      empty.style.display = 'block';
      empty.textContent = tr('noChartData');
      legend.innerHTML = '';
      return;
    }
    empty.style.display = 'none';

    var labels = breakdown.map(function (b) { return b.category; });
    var values = breakdown.map(function (b) { return b.amount; });
    var colors = labels.map(function (_, i) { return COLORS[i % COLORS.length]; });
    var total = values.reduce(function (a, b) { return a + b; }, 0);

    wrap.innerHTML = buildDonutSVG(values, colors, total);
    renderLegend(breakdown, colors, total);
  }

  var LEGEND_VISIBLE = 5;

  function renderLegend(breakdown, colors, total) {
    var legend = document.getElementById('chartLegend');

    var itemsHtml = breakdown.map(function (b, i) {
      var pct = total ? Math.round((b.amount / total) * 100) : 0;
      return '<div class="legend-item"><span class="legend-dot" style="background:' + colors[i] + '"></span>' +
        '<span class="legend-name">' + escapeHtml(b.category) + '</span>' +
        '<span class="legend-right"><span class="legend-money">' + money(b.amount) + '</span>' +
        '<span class="legend-pct">' + pct + '%</span></span></div>';
    });

    var visibleHtml = itemsHtml.slice(0, LEGEND_VISIBLE).join('');
    var extraCount = itemsHtml.length - LEGEND_VISIBLE;
    var extraHtml = itemsHtml.slice(LEGEND_VISIBLE).join('');

    var toggleHtml = '';
    if (extraCount > 0) {
      toggleHtml = '<button type="button" id="legendToggle" class="legend-toggle">' +
        '<span id="legendToggleLabel">' + tr('showMore') + ' (' + extraCount + ')</span>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>' +
        '</button>';
    }

    legend.innerHTML = visibleHtml +
      '<div id="legendExtra" class="legend-extra">' + extraHtml + '</div>' +
      toggleHtml;

    var toggleBtn = document.getElementById('legendToggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        var extraBox = document.getElementById('legendExtra');
        var expanded = toggleBtn.classList.toggle('expanded');
        extraBox.classList.toggle('open', expanded);
        document.getElementById('legendToggleLabel').textContent = expanded
          ? tr('showLess')
          : tr('showMore') + ' (' + extraCount + ')';
      });
    }
  }

  /** Pure-SVG donut chart — no external chart library, so it can never fail to load
   *  inside the sandboxed Apps Script iframe. Stroke-dasharray draws each ring segment. */
  function buildDonutSVG(values, colors, total) {
    var size = 170, radius = 62, cx = 85, cy = 85, strokeWidth = 22;
    var circumference = 2 * Math.PI * radius;
    var offset = 0;

    var segments = values.map(function (v, i) {
      var frac = total ? v / total : 0;
      var dash = Math.max(frac * circumference - 1.5, 0); // tiny gap between segments
      var circle = '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" ' +
        'stroke="' + colors[i] + '" stroke-width="' + strokeWidth + '" stroke-linecap="round" ' +
        'stroke-dasharray="' + dash + ' ' + (circumference - dash) + '" ' +
        'stroke-dashoffset="' + (-offset) + '"/>';
      offset += frac * circumference;
      return circle;
    }).join('');

    return '<svg viewBox="0 0 ' + size + ' ' + size + '">' + segments + '</svg>' +
      '<div class="donut-center"><span class="dc-amt">' + money(total) + '</span>' +
      '<span class="dc-label">' + tr(state.chartType === 'Income' ? 'income' : 'expense') + '</span></div>';
  }

  /* ---------------- Transactions ---------------- */
  function bindTransactions() {
    document.querySelectorAll('#filterRow .chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        document.querySelectorAll('#filterRow .chip').forEach(function (c) { c.classList.remove('active'); });
        chip.classList.add('active');
        state.txFilter = chip.dataset.filter;
        loadTransactions();
      });
    });
  }

  function loadTransactions() {
    if (!state.month || state.searchQuery) return;
    google.script.run.withSuccessHandler(function (list) { renderTransactions(list, false); })
      .withFailureHandler(showErr).getTransactions(state.month, state.txFilter);
  }

  function renderTransactions(list, isSearch) {
    var box = document.getElementById('txList');
    var emptyMsg = isSearch ? tr('noSearchResults') : tr('noFilterTx');
    box.innerHTML = list.length ? list.map(txRow).join('') : '<div class="empty-state">' + emptyMsg + '</div>';
    attachDeleteHandlers(box, function () { if (state.searchQuery) runSearch(); else loadTransactions(); }, loadDashboard);
  }

  /* ---------------- Search ---------------- */
  function bindSearch() {
    var input = document.getElementById('searchInput');
    var clearBtn = document.getElementById('clearSearch');
    var debounceTimer = null;

    input.addEventListener('input', function () {
      state.searchQuery = input.value.trim();
      clearBtn.style.display = state.searchQuery ? 'flex' : 'none';
      document.getElementById('filterRow').style.opacity = state.searchQuery ? '0.4' : '1';
      document.getElementById('filterRow').style.pointerEvents = state.searchQuery ? 'none' : 'auto';

      clearTimeout(debounceTimer);
      if (!state.searchQuery) { loadTransactions(); return; }
      debounceTimer = setTimeout(runSearch, 250);
    });

    clearBtn.addEventListener('click', function () {
      input.value = '';
      state.searchQuery = '';
      clearBtn.style.display = 'none';
      document.getElementById('filterRow').style.opacity = '1';
      document.getElementById('filterRow').style.pointerEvents = 'auto';
      loadTransactions();
    });
  }

  function runSearch() {
    if (!state.searchQuery) return;
    google.script.run.withSuccessHandler(function (list) { renderTransactions(list, true); })
      .withFailureHandler(showErr).searchTransactions(state.searchQuery);
  }

  function txRow(t) {
    state.txIndex[t.id] = t;
    var icon = t.type === 'Income'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
    var sub = [t.paymentMethod, t.notes].filter(Boolean).join(' · ');
    return '<div class="tx-row ' + t.type + '" data-id="' + t.id + '">' +
      '<div class="tx-icon">' + icon + '</div>' +
      '<div class="tx-mid"><div class="tx-cat">' + escapeHtml(t.category) + '</div>' +
      '<div class="tx-sub">' + (sub ? escapeHtml(sub) : '&nbsp;') + '</div></div>' +
      '<div class="tx-right"><div class="tx-amt">' + (t.type === 'Income' ? '+' : '−') + money(t.amount) + '</div>' +
      '<div class="tx-date">' + t.date + '</div></div>' +
      '<div class="tx-actions">' +
      '<button class="tx-edit" data-id="' + t.id + '" aria-label="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>' +
      '<button class="tx-del" data-id="' + t.id + '" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '</div>' +
      '</div>';
  }

  function attachDeleteHandlers(container, refresh1, refresh2) {
    container.querySelectorAll('.tx-edit').forEach(function (btn) {
      btn.addEventListener('click', function () { startEdit(btn.dataset.id); });
    });
    container.querySelectorAll('.tx-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showConfirm(tr('confirmDeleteTx'), function () {
          google.script.run.withSuccessHandler(function () {
            refresh1();
            if (refresh2) refresh2();
            toast(tr('toastTxDeleted'));
          }).withFailureHandler(showErr).deleteTransaction(btn.dataset.id);
        });
      });
    });
  }

  /* ---------------- Edit transaction ---------------- */
  function startEdit(id) {
    var t = state.txIndex[id];
    if (!t) return;
    state.editingId = id;
    state.type = t.type;

    document.querySelectorAll('.nav-btn').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
    document.querySelector('.nav-btn[data-page="add"]').classList.add('active');
    document.getElementById('page-add').classList.add('active');

    document.querySelectorAll('#typeToggle .seg-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.type === t.type);
    });
    populateCategorySelect();

    document.getElementById('fAmount').value = t.amount;
    document.getElementById('fCategory').value = t.category;
    document.getElementById('fPayment').value = t.paymentMethod || 'Cash';
    document.getElementById('fDate').value = t.date;
    document.getElementById('fNotes').value = t.notes || '';

    document.getElementById('submitTx').textContent = tr('updateTransaction');
    document.getElementById('editBanner').style.display = 'flex';
  }

  function bindCancelEdit() {
    document.getElementById('cancelEdit').addEventListener('click', exitEditMode);
  }

  function exitEditMode() {
    state.editingId = null;
    document.getElementById('editBanner').style.display = 'none';
    document.getElementById('submitTx').textContent = tr('addTransaction');
    document.getElementById('fAmount').value = '';
    document.getElementById('fNotes').value = '';
    document.getElementById('fDate').valueAsDate = new Date();
  }

  /* ---------------- Add form ---------------- */
  function bindAddForm() {
    document.querySelectorAll('#typeToggle .seg-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('#typeToggle .seg-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.type = btn.dataset.type;
        populateCategorySelect();
      });
    });

    document.getElementById('submitTx').addEventListener('click', function () {
      var amount = document.getElementById('fAmount').value;
      var category = document.getElementById('fCategory').value;
      var date = document.getElementById('fDate').value;
      if (!amount || Number(amount) <= 0) { toast(tr('errInvalidAmount'), true); return; }
      if (!category) { toast(tr('errNoCategory'), true); return; }
      if (!date) { toast(tr('errNoDate'), true); return; }

      var payload = {
        type: state.type,
        amount: amount,
        category: category,
        paymentMethod: document.getElementById('fPayment').value,
        date: date,
        notes: document.getElementById('fNotes').value
      };

      var btn = document.getElementById('submitTx');
      var editId = state.editingId;
      btn.disabled = true;
      btn.textContent = editId ? tr('updating') : tr('adding');

      var call = google.script.run.withSuccessHandler(function () {
        btn.disabled = false;
        if (editId) {
          exitEditMode();
          toast(tr('toastTxUpdated'));
          document.querySelectorAll('.nav-btn').forEach(function (b) { b.classList.remove('active'); });
          document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
          document.querySelector('.nav-btn[data-page="transactions"]').classList.add('active');
          document.getElementById('page-transactions').classList.add('active');
        } else {
          btn.textContent = tr('addTransaction');
          document.getElementById('fAmount').value = '';
          document.getElementById('fNotes').value = '';
          toast(state.type === 'Income' ? tr('toastIncomeAdded') : tr('toastExpenseAdded'));
        }
        refreshMonthsThenReload();
      }).withFailureHandler(function (e) {
        btn.disabled = false;
        btn.textContent = editId ? tr('updateTransaction') : tr('addTransaction');
        showErr(e);
      });

      if (editId) call.updateTransaction(editId, payload);
      else call.addTransaction(payload);
    });
  }

  function refreshMonthsThenReload() {
    google.script.run.withSuccessHandler(function (months) {
      state.months = months;
      renderMonthSelect();
      loadDashboard();
      if (state.searchQuery) runSearch(); else loadTransactions();
    }).getMonthsList();
  }

  function onCategoriesLoaded(cats) {
    state.categories = cats;
    populateCategorySelect();
    renderCategoryLists();
  }

  function populateCategorySelect() {
    var list = state.type === 'Income' ? state.categories.income : state.categories.expense;
    var sel = document.getElementById('fCategory');
    sel.innerHTML = list.length
      ? list.map(function (c) { return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>'; }).join('')
      : '<option value="">' + tr('noCategorySelect') + '</option>';
  }

  /* ---------------- Categories ---------------- */
  function bindCategories() {
    document.querySelectorAll('.add-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var type = btn.dataset.type;
        var input = type === 'Income' ? document.getElementById('newIncomeCat') : document.getElementById('newExpenseCat');
        var name = input.value.trim();
        if (!name) return;
        google.script.run.withSuccessHandler(function (cats) {
          state.categories = cats;
          renderCategoryLists();
          populateCategorySelect();
          input.value = '';
          toast(tr('toastCategoryAdded'));
        }).withFailureHandler(showErr).addCategory(name, type);
      });
    });
  }

  function renderCategoryLists() {
    document.getElementById('expenseCatList').innerHTML = state.categories.expense.map(catChip('Expense')).join('') ||
      '<span class="empty-state">' + tr('noCategoriesYet') + '</span>';
    document.getElementById('incomeCatList').innerHTML = state.categories.income.map(catChip('Income')).join('') ||
      '<span class="empty-state">' + tr('noCategoriesYet') + '</span>';

    bindCategoryChipActions(document.getElementById('expenseCatList'));
    bindCategoryChipActions(document.getElementById('incomeCatList'));
  }

  function bindCategoryChipActions(container) {
    container.querySelectorAll('.cat-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var chip = btn.closest('.cat-chip');
        var name = chip.dataset.name, type = chip.dataset.type;
        showConfirm(tr('confirmDeleteCat').replace('{name}', name), function () {
          google.script.run.withSuccessHandler(function (cats) {
            state.categories = cats;
            renderCategoryLists();
            populateCategorySelect();
            toast(tr('toastCategoryDeleted'));
          }).withFailureHandler(showErr).deleteCategory(name, type);
        });
      });
    });

    container.querySelectorAll('.cat-edit').forEach(function (btn) {
      btn.addEventListener('click', function () {
        startCategoryEdit(btn.closest('.cat-chip'));
      });
    });
  }

  function startCategoryEdit(chip) {
    var name = chip.dataset.name, type = chip.dataset.type;
    chip.classList.add('editing');
    chip.innerHTML =
      '<input type="text" class="cat-edit-input" value="' + escapeHtml(name) + '">' +
      '<button type="button" class="cat-save" aria-label="Save">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></button>' +
      '<button type="button" class="cat-cancel" aria-label="Cancel">✕</button>';

    var input = chip.querySelector('.cat-edit-input');
    input.focus();
    input.select();

    function save() {
      var newName = input.value.trim();
      if (!newName || newName === name) { renderCategoryLists(); return; }
      google.script.run.withSuccessHandler(function (cats) {
        state.categories = cats;
        renderCategoryLists();
        populateCategorySelect();
        toast(tr('toastCategoryUpdated'));
      }).withFailureHandler(function (e) { showErr(e); renderCategoryLists(); }).renameCategory(name, newName, type);
    }

    chip.querySelector('.cat-save').addEventListener('click', save);
    chip.querySelector('.cat-cancel').addEventListener('click', function () { renderCategoryLists(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') renderCategoryLists();
    });
  }

  function catChip(type) {
    return function (name) {
      return '<span class="cat-chip" data-name="' + escapeHtml(name) + '" data-type="' + type + '">' +
        '<span class="cat-chip-label">' + escapeHtml(name) + '</span>' +
        '<button type="button" class="cat-edit" aria-label="Edit">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>' +
        '<button type="button" class="cat-del" aria-label="Delete">✕</button>' +
        '</span>';
    };
  }

  /* ---------------- Helpers ---------------- */
  function toast(msg, isError) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(function () { el.className = 'toast'; }, 2200);
  }

  function showErr(e) {
    toast(e && e.message ? e.message : tr('errGeneric'), true);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
