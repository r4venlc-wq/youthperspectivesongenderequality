/* =========================================================
   Youth Perspectives on Gender Equality — app logic
   Reads window.SURVEY (from data.js), computes stats,
   and renders every chart + the interactive explorer.
   ========================================================= */
(function () {
  "use strict";
  var S = window.SURVEY;
  var R = S.records;

  /* ---------- palette ---------- */
  var C = {
    purple: "#8b5cf6",
    bright: "#a78bfa",
    deep: "#5b2ec9",
    pink: "#d68bf0",
    teal: "#5cc7c0",
    amber: "#e0a35c",
    grid: "rgba(255,255,255,0.06)",
    tick: "#b3a9c6",
    ink: "#f5f2fa",
    faint: "#7d7391",
  };
  // ordered palette for categorical charts
  var SEQ = [C.bright, C.deep, C.pink, C.teal, C.amber, "#7c5cff", "#c9a2ff", "#4a7bd6"];

  /* ---------- Chart.js global defaults ---------- */
  if (window.Chart) {
    Chart.defaults.color = C.tick;
    Chart.defaults.font.family = "Inter, system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.legend.labels.padding = 16;
    Chart.defaults.plugins.tooltip.backgroundColor = "#1a1329";
    Chart.defaults.plugins.tooltip.borderColor = "rgba(139,92,246,0.4)";
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 12;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.titleColor = C.ink;
    Chart.defaults.plugins.tooltip.bodyColor = C.tick;
  }

  /* ---------- data helpers ---------- */
  function filt(records, filters) {
    if (!filters) return records;
    return records.filter(function (r) {
      for (var f in filters) {
        var allowed = filters[f];
        if (allowed && allowed.length && allowed.indexOf(r[f]) === -1) return false;
      }
      return true;
    });
  }
  function countBy(records, field, order) {
    var m = {};
    records.forEach(function (r) {
      var v = r[field];
      if (v === null || v === "" || v === undefined) return;
      m[v] = (m[v] || 0) + 1;
    });
    var keys = order ? order.filter(function (k) { return m[k]; }) : Object.keys(m).sort(function (a, b) { return m[b] - m[a]; });
    return { labels: keys, values: keys.map(function (k) { return m[k]; }) };
  }
  function pct(part, whole) { return whole ? Math.round((1000 * part) / whole) / 10 : 0; }
  function mean(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : 0; }
  function median(arr) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  // % giving one of targetVals for `field`, within each group of `groupField`
  function rateByGroup(records, groupField, field, targetVals, order) {
    var groups = {};
    records.forEach(function (r) {
      if (!r[groupField] || !r[field]) return;
      (groups[r[groupField]] = groups[r[groupField]] || []).push(targetVals.indexOf(r[field]) !== -1);
    });
    var keys = (order || Object.keys(groups)).filter(function (k) { return groups[k]; });
    return keys.map(function (k) {
      var g = groups[k];
      var yes = g.filter(Boolean).length;
      return { label: k, pct: pct(yes, g.length), n: g.length };
    });
  }
  function equalityValues(records) {
    return records.map(function (r) { return r.equality; }).filter(function (v) { return typeof v === "number"; });
  }

  /* ---------- reusable chart builders ---------- */
  var charts = {};
  function make(id, cfg) {
    var el = document.getElementById(id);
    if (!el || !window.Chart) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(el.getContext("2d"), cfg);
    return charts[id];
  }

  function doughnut(id, dist, colors) {
    return make(id, {
      type: "doughnut",
      data: {
        labels: dist.labels,
        datasets: [{
          data: dist.values,
          backgroundColor: colors || SEQ,
          borderColor: "#0f0b18",
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "62%",
        plugins: {
          legend: { position: "bottom" },
          tooltip: { callbacks: { label: function (c) {
            var total = c.dataset.data.reduce(function (a, b) { return a + b; }, 0);
            return " " + c.label + ": " + c.parsed + " (" + pct(c.parsed, total) + "%)";
          } } },
        },
      },
    });
  }

  function hbar(id, dist, opts) {
    opts = opts || {};
    return make(id, {
      type: "bar",
      data: {
        labels: dist.labels,
        datasets: [{
          data: dist.values,
          backgroundColor: opts.colors || dist.labels.map(function (_, i) { return SEQ[i % SEQ.length]; }),
          borderRadius: 6,
          borderSkipped: false,
          barThickness: opts.thickness || "flex",
          maxBarThickness: 46,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: opts.tooltip } } },
        scales: {
          x: { grid: { color: C.grid }, ticks: { color: C.tick }, beginAtZero: true, suggestedMax: opts.max },
          y: { grid: { display: false }, ticks: { color: C.ink, font: { size: 12.5 } } },
        },
      },
    });
  }

  // grouped-vs comparison: percentage bars with n annotations
  function pctBars(id, rows, opts) {
    opts = opts || {};
    return make(id, {
      type: "bar",
      data: {
        labels: rows.map(function (r) { return r.label; }),
        datasets: [{
          data: rows.map(function (r) { return r.pct; }),
          backgroundColor: rows.map(function (_, i) { return opts.colors ? opts.colors[i] : SEQ[i % SEQ.length]; }),
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 90,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 18 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return " " + c.parsed.y + "%  (n = " + rows[c.dataIndex].n + ")"; } } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: C.ink, font: { size: 12.5 } } },
          y: { grid: { color: C.grid }, ticks: { color: C.tick, callback: function (v) { return v + "%"; } }, beginAtZero: true, max: opts.max || 100 },
        },
      },
      plugins: [nLabels(rows, "%")],
    });
  }

  // plugin: draw n on top of bars
  function nLabels(rows, suffix) {
    return {
      id: "nlabels" + Math.random(),
      afterDatasetsDraw: function (chart) {
        var ctx = chart.ctx;
        var meta = chart.getDatasetMeta(0);
        meta.data.forEach(function (bar, i) {
          ctx.save();
          ctx.fillStyle = "#e9deff";
          ctx.font = "600 12px Inter, sans-serif";
          ctx.textAlign = "center";
          var val = chart.data.datasets[0].data[i];
          ctx.fillText(val + (suffix || ""), bar.x, bar.y - 8);
          ctx.fillStyle = "#7d7391";
          ctx.font = "500 10.5px Inter, sans-serif";
          ctx.fillText("n=" + rows[i].n, bar.x, bar.y - 22);
          ctx.restore();
        });
      },
    };
  }

  /* ================= FIXED SECTION CHARTS ================= */
  var GENDER_ORDER = ["Female", "Male", "Other", "Prefer not to say"];
  var GENDER_COLORS = [C.bright, C.teal, C.amber, C.faint];

  function renderHero() {
    document.getElementById("heroN").textContent = S.meta.n_total;
    document.getElementById("footN").textContent = S.meta.n_total;
    var langs = Object.keys(S.meta.n_by_lang).length;
    var stats = [
      { num: S.meta.n_total, label: "respondents" },
      { num: langs, label: "survey languages" },
      { num: S.meta.equality_median, sup: "/10", label: "median equality rating" },
      { num: S.meta.voices_total, label: "open-ended stories" },
    ];
    document.getElementById("heroStats").innerHTML = stats.map(function (s) {
      return '<div class="stat"><div class="stat__num">' + s.num + (s.sup ? '<small>' + s.sup + '</small>' : '') +
        '</div><div class="stat__label">' + s.label + '</div></div>';
    }).join("");
  }

  function renderDemographics() {
    doughnut("cGender", countBy(R, "gender", GENDER_ORDER), GENDER_COLORS);
    doughnut("cAge", countBy(R, "age", ["14-17", "18-20", "20-25", "Other"]));
    doughnut("cLocation", countBy(R, "location", ["Big city", "Town / Small city", "Rural area"]));
    var edu = countBy(R, "education");
    hbar("cEducation", edu, { tooltip: function (c) { return " " + c.parsed.x + " respondents"; } });
    var region = countBy(R, "region");
    hbar("cRegion", region, { tooltip: function (c) { return " " + c.parsed.x + " respondents"; } });
  }

  function renderEquality() {
    // distribution 1..10
    var buckets = {};
    for (var i = 1; i <= 10; i++) buckets[i] = 0;
    equalityValues(R).forEach(function (v) { buckets[v]++; });
    var labels = Object.keys(buckets);
    make("cEqDist", {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          data: labels.map(function (k) { return buckets[k]; }),
          backgroundColor: labels.map(function (k) {
            var n = +k;
            // low = deep, high = bright
            return n <= 3 ? "#5b2ec9" : n <= 6 ? "#8b5cf6" : "#c9a2ff";
          }),
          borderRadius: 5, borderSkipped: false,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return " " + c.parsed.y + " respondents rated " + c.label; } } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: C.tick }, title: { display: true, text: "1 = very low   →   10 = complete equality", color: C.faint, font: { size: 11 } } },
          y: { grid: { color: C.grid }, ticks: { color: C.tick }, beginAtZero: true },
        },
      },
    });
    var eq = equalityValues(R);
    document.getElementById("eqSummary").innerHTML =
      "Based on <strong>" + eq.length + "</strong> ratings · mean <strong>" + (Math.round(mean(eq) * 10) / 10) +
      "</strong> · median <strong>" + median(eq) + "</strong>. Most answers cluster in the lower half of the scale.";

    // mean by group (gender + age + education combined)
    function meansFor(field, order) {
      var groups = {};
      R.forEach(function (r) {
        if (!r[field] || typeof r.equality !== "number") return;
        (groups[r[field]] = groups[r[field]] || []).push(r.equality);
      });
      return (order || Object.keys(groups)).filter(function (k) { return groups[k] && groups[k].length >= 3; })
        .map(function (k) { return { label: k, val: Math.round(mean(groups[k]) * 100) / 100, n: groups[k].length }; });
    }
    var rows = []
      .concat(meansFor("gender", ["Female", "Male"]))
      .concat(meansFor("age", ["14-17", "18-20", "20-25"]))
      .concat(meansFor("education", ["Private school student", "University student", "Public school student", "International school student"]));
    make("cEqByGroup", {
      type: "bar",
      data: {
        labels: rows.map(function (r) { return shorten(r.label); }),
        datasets: [{ data: rows.map(function (r) { return r.val; }), backgroundColor: rows.map(function (_, i) { return i < 2 ? C.bright : i < 5 ? C.purple : C.deep; }), borderRadius: 6, maxBarThickness: 34 }],
      },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return " mean " + c.parsed.x + " / 10  (n = " + rows[c.dataIndex].n + ")"; } } } },
        scales: { x: { grid: { color: C.grid }, ticks: { color: C.tick }, beginAtZero: true, max: 10 }, y: { grid: { display: false }, ticks: { color: C.ink } } },
      },
      plugins: [{
        id: "eqn", afterDatasetsDraw: function (chart) {
          var ctx = chart.ctx, meta = chart.getDatasetMeta(0);
          meta.data.forEach(function (bar, i) {
            ctx.save(); ctx.fillStyle = "#e9deff"; ctx.font = "600 11px Inter"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
            ctx.fillText("  " + rows[i].val + "  (n=" + rows[i].n + ")", bar.x, bar.y); ctx.restore();
          });
        },
      }],
    });

    // equality by experience split
    function splitMean(field, a, b) {
      var va = R.filter(function (r) { return r[field] === a && typeof r.equality === "number"; }).map(function (r) { return r.equality; });
      var vb = R.filter(function (r) { return r[field] === b && typeof r.equality === "number"; }).map(function (r) { return r.equality; });
      return { a: { m: Math.round(mean(va) * 100) / 100, n: va.length }, b: { m: Math.round(mean(vb) * 100) / 100, n: vb.length } };
    }
    var walkComf = R.filter(function (r) { return (r.walking_alone === "Always" || r.walking_alone === "Most of the time") && typeof r.equality === "number"; }).map(function (r) { return r.equality; });
    var walkUnc = R.filter(function (r) { return (r.walking_alone === "Rarely" || r.walking_alone === "Never") && typeof r.equality === "number"; }).map(function (r) { return r.equality; });
    var splits = [
      { name: "Experienced harassment", d: splitMean("harassment", "Yes", "No"), la: "Yes", lb: "No" },
      { name: "Judged for their body", d: splitMean("body_judged", "Yes", "No"), la: "Yes", lb: "No" },
      { name: "Knows a woman who faced violence", d: splitMean("know_victim", "Yes", "No"), la: "Yes", lb: "No" },
      { name: "Comfortable walking alone", d: { a: { m: Math.round(mean(walkComf) * 100) / 100, n: walkComf.length }, b: { m: Math.round(mean(walkUnc) * 100) / 100, n: walkUnc.length } }, la: "Comfortable", lb: "Not comfortable" },
    ];
    make("cEqBySplit", {
      type: "bar",
      data: {
        labels: splits.map(function (s) { return s.name; }),
        datasets: [
          { label: "Reported (or comfortable)", data: splits.map(function (s) { return s.d.a.m; }), backgroundColor: C.deep, borderRadius: 6, maxBarThickness: 40 },
          { label: "Not reported (or not comfortable)", data: splits.map(function (s) { return s.d.b.m; }), backgroundColor: C.bright, borderRadius: 6, maxBarThickness: 40 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "top" },
          tooltip: { callbacks: { label: function (c) {
            var s = splits[c.dataIndex]; var side = c.datasetIndex === 0 ? s.d.a : s.d.b;
            return " mean " + side.m + " / 10  (n = " + side.n + ")";
          } } },
        },
        scales: { x: { grid: { display: false }, ticks: { color: C.ink, font: { size: 11.5 } } }, y: { grid: { color: C.grid }, ticks: { color: C.tick }, beginAtZero: true, max: 10, title: { display: true, text: "mean equality rating", color: C.faint, font: { size: 11 } } } },
      },
    });
  }

  function renderExperiences() {
    pctBars("cHarassGender", rateByGroup(R, "gender", "harassment", ["Yes"], ["Female", "Male"]), { colors: GENDER_COLORS });
    pctBars("cBeautyGender", rateByGroup(R, "gender", "beauty_pressure", ["A lot"], ["Female", "Male"]), { colors: GENDER_COLORS });
    pctBars("cBodyGender", rateByGroup(R, "gender", "body_judged", ["Yes"], ["Female", "Male"]), { colors: GENDER_COLORS });
    // family diff excluding "Not applicable"
    var famRecords = R.filter(function (r) { return r.family_diff === "Yes" || r.family_diff === "No"; });
    pctBars("cFamilyGender", rateByGroup(famRecords, "gender", "family_diff", ["Yes"], ["Female", "Male"]), { colors: GENDER_COLORS });

    // body-image excerpts
    document.getElementById("bodyVoices").innerHTML = S.bodyVoices.map(voiceCard(false)).join("");
  }

  function renderSafety() {
    pctBars("cWalkGender", rateByGroup(R, "gender", "walking_alone", ["Always", "Most of the time"], ["Female", "Male"]), { colors: GENDER_COLORS });
    pctBars("cWalkHarass", rateByGroup(R, "harassment", "walking_alone", ["Rarely", "Never"], ["Yes", "No"]), { colors: [C.deep, C.teal] });
    doughnut("cCurfew", countBy(R, "curfew", ["Before 6 PM", "6-7 PM", "8-9 PM", "10-12 PM", "After 12 PM", "No curfew"]));
    pctBars("cViolenceGender", rateByGroup(R, "gender", "know_victim", ["Yes"], ["Female", "Male"]), { colors: GENDER_COLORS });
  }

  function renderConsent() {
    doughnut("cConsentOverall", countBy(R, "consent_edu", ["Yes", "Barely", "No"]), [C.bright, C.amber, C.deep]);
    var rows = rateByGroup(R, "education", "consent_edu", ["Yes"],
      ["Private school student", "University student", "Public school student", "International school student", "Working / employed"]);
    // shorten labels
    var short = rows.map(function (r) { return { label: shorten(r.label), pct: r.pct, n: r.n }; });
    pctBars("cConsentEdu", short, { colors: SEQ });
  }

  function shorten(label) {
    return label
      .replace("Private school student", "Private")
      .replace("International school student", "Int'l")
      .replace("Public school student", "Public")
      .replace("University student", "University")
      .replace("Working / employed", "Working")
      .replace("Not currently in school or employed", "Neither");
  }

  /* ================= VOICES ================= */
  function voiceCard(withTheme) {
    return function (v) {
      var rtl = v.lang === "Arabic";
      var html = '<figure class="' + (withTheme ? "voice" : "pullquote") + '"' + (rtl ? ' dir="rtl" lang="ar"' : '') + '>';
      if (withTheme && v.theme) html += '<span class="voice__theme">' + v.theme + "</span>";
      html += "<p>&ldquo;" + v.text + "&rdquo;</p>";
      if (v.translation) html += '<p class="trans">&ldquo;' + v.translation + "&rdquo;</p>";
      html += "<cite>" + v.who + " · " + v.lang + "</cite></figure>";
      return html;
    };
  }

  function renderVoices() {
    var maxCount = Math.max.apply(null, S.themes.map(function (t) { return t.count; }));
    document.getElementById("themeBars").innerHTML = S.themes.map(function (t) {
      return '<div class="theme"><span class="theme__label">' + t.name + '</span>' +
        '<span class="theme__track"><span class="theme__fill" data-w="' + (t.count / maxCount * 100) + '"></span></span>' +
        '<span class="theme__count">' + t.count + " mentions</span></div>";
    }).join("");
    document.getElementById("voicesList").innerHTML = S.voices.map(voiceCard(true)).join("");
  }

  /* ================= KEY FINDINGS ================= */
  function computeFindings() {
    function rate(records, field, targetVals) {
      var elig = records.filter(function (r) { return r[field]; });
      var hit = elig.filter(function (r) { return targetVals.indexOf(r[field]) !== -1; });
      return { pct: pct(hit.length, elig.length), n: elig.length };
    }
    var eqAll = equalityValues(R);
    var femHar = rate(R.filter(function (r) { return r.gender === "Female"; }), "harassment", ["Yes"]);
    var malHar = rate(R.filter(function (r) { return r.gender === "Male"; }), "harassment", ["Yes"]);
    var femWalk = rate(R.filter(function (r) { return r.gender === "Female"; }), "walking_alone", ["Always", "Most of the time"]);
    var malWalk = rate(R.filter(function (r) { return r.gender === "Male"; }), "walking_alone", ["Always", "Most of the time"]);
    var knowV = rate(R, "know_victim", ["Yes"]);
    var noConsent = rate(R, "consent_edu", ["No", "Barely"]);
    var bodyJudged = rate(R, "body_judged", ["Yes"]);
    var femEq = mean(R.filter(function (r) { return r.gender === "Female"; }).map(function (r) { return r.equality; }).filter(isNum));
    var malEq = mean(R.filter(function (r) { return r.gender === "Male"; }).map(function (r) { return r.equality; }).filter(isNum));
    var harEq = mean(R.filter(function (r) { return r.harassment === "Yes"; }).map(function (r) { return r.equality; }).filter(isNum));
    var noHarEq = mean(R.filter(function (r) { return r.harassment === "No"; }).map(function (r) { return r.equality; }).filter(isNum));

    return [
      {
        h: "Equality is rated low — and the low scores come mostly from young women",
        p: 'Across <span class="stat-inline">' + eqAll.length + '</span> ratings the average was <span class="stat-inline">' + r1(mean(eqAll)) + '/10</span> (median ' + median(eqAll) + '). Young women averaged <span class="stat-inline">' + r1(femEq) + '</span> versus <span class="stat-inline">' + r1(malEq) + '</span> for young men — a consistent gap rather than a handful of outliers.',
      },
      {
        h: "Harassment was reported far more often by female respondents",
        p: '<span class="stat-inline">' + femHar.pct + '%</span> of female respondents (n = ' + femHar.n + ') said they had experienced harassment because of their gender, compared with <span class="stat-inline">' + malHar.pct + '%</span> of male respondents (n = ' + malHar.n + ').',
      },
      {
        h: "Feeling safe alone in your own neighbourhood is not shared equally",
        p: 'Only <span class="stat-inline">' + femWalk.pct + '%</span> of female respondents felt comfortable walking alone always or most of the time, against <span class="stat-inline">' + malWalk.pct + '%</span> of male respondents. Those who reported harassment were about three times as likely to feel rarely or never comfortable.',
      },
      {
        h: "Reported experiences track with lower equality ratings",
        p: 'Respondents who reported harassment rated equality <span class="stat-inline">' + r1(harEq) + '/10</span> on average, versus <span class="stat-inline">' + r1(noHarEq) + '/10</span> among those who did not. Similar gaps appear for body judgment, knowing someone who faced violence, and discomfort walking alone. These are associations, not causes.',
      },
      {
        h: "Knowing a woman who experienced violence was strikingly common",
        p: '<span class="stat-inline">' + knowV.pct + '%</span> of respondents (n = ' + knowV.n + ') said they personally know a woman who has experienced inappropriate touching or physical violence.',
      },
      {
        h: "Most respondents feel they lack solid education on consent and body autonomy",
        p: '<span class="stat-inline">' + noConsent.pct + '%</span> said they had received no, or only barely any, proper education about relationships, consent and body autonomy (n = ' + noConsent.n + '). Access varied widely by school type.',
      },
      {
        h: "Body-image pressure is near-universal — for young men too",
        p: '<span class="stat-inline">' + bodyJudged.pct + '%</span> of respondents said they had been judged for their body. In the open responses, girls described weight and clothing scrutiny while boys most often described being mocked as \u201ctoo skinny\u201d.',
      },
      {
        h: "The clearest patterns live in the stories, not just the numbers",
        p: 'The two most common themes in the open-ended answers were unequal treatment at <strong>school</strong> and different <strong>rules for brothers and sisters at home</strong> (18 mentions each), followed by being allowed to <strong>go out</strong> (13). See the Voices section.',
      },
    ];
  }
  function isNum(v) { return typeof v === "number"; }
  function r1(v) { return Math.round(v * 10) / 10; }

  function renderFindings() {
    document.getElementById("findingsList").innerHTML = computeFindings().map(function (f) {
      return "<li><h3>" + f.h + "</h3><p>" + f.p + "</p></li>";
    }).join("");
  }

  /* ================= INTERACTIVE EXPLORER ================= */
  var MEASURES = [
    { key: "equality", label: "Equality rating (1–10)", type: "mean" },
    { key: "harassment", label: "Experienced harassment", type: "rate", target: ["Yes"], targetLabel: "% Yes" },
    { key: "walking_alone", label: "Comfortable walking alone", type: "rate", target: ["Always", "Most of the time"], targetLabel: "% comfortable" },
    { key: "beauty_pressure", label: "High beauty pressure", type: "rate", target: ["A lot"], targetLabel: "% 'a lot'" },
    { key: "body_judged", label: "Judged for their body", type: "rate", target: ["Yes"], targetLabel: "% Yes" },
    { key: "consent_edu", label: "Received consent education", type: "rate", target: ["Yes"], targetLabel: "% Yes" },
    { key: "know_victim", label: "Knows a woman who faced violence", type: "rate", target: ["Yes"], targetLabel: "% Yes" },
    { key: "family_diff", label: "Treated differently from sibling", type: "rate", target: ["Yes"], targetLabel: "% Yes", exclude: ["Not applicable", "Prefer not to say"] },
  ];
  var GROUPS = [
    { key: "gender", label: "Gender", order: ["Female", "Male", "Other", "Prefer not to say"] },
    { key: "age", label: "Age group", order: ["14-17", "18-20", "20-25"] },
    { key: "location", label: "Location type", order: ["Big city", "Town / Small city", "Rural area"] },
    { key: "education", label: "Education / occupation", order: null },
    { key: "region", label: "Region", order: null },
  ];
  var FILTER_FIELDS = [
    { key: "gender", label: "Gender", order: ["Female", "Male"] },
    { key: "age", label: "Age", order: ["14-17", "18-20", "20-25"] },
    { key: "location", label: "Location", order: ["Big city", "Town / Small city", "Rural area"] },
  ];
  var exState = { measure: "equality", group: "gender", filters: {} };

  function buildExplorerControls() {
    var mSel = document.getElementById("exMeasure");
    mSel.innerHTML = MEASURES.map(function (m) { return '<option value="' + m.key + '">' + m.label + "</option>"; }).join("");
    var gSel = document.getElementById("exGroup");
    gSel.innerHTML = GROUPS.map(function (g) { return '<option value="' + g.key + '">' + g.label + "</option>"; }).join("");
    var fWrap = document.getElementById("exFilters");
    fWrap.innerHTML = FILTER_FIELDS.map(function (f) {
      return '<div class="filter-row"><span>' + f.label + '</span><div class="chips" data-field="' + f.key + '">' +
        f.order.map(function (v) { return '<button class="chip" type="button" data-val="' + v + '">' + v + "</button>"; }).join("") +
        "</div></div>";
    }).join("");

    mSel.addEventListener("change", function () { exState.measure = mSel.value; drawExplorer(); });
    gSel.addEventListener("change", function () { exState.group = gSel.value; drawExplorer(); });
    fWrap.addEventListener("click", function (e) {
      var btn = e.target.closest(".chip"); if (!btn) return;
      var field = btn.parentNode.getAttribute("data-field"); var val = btn.getAttribute("data-val");
      btn.classList.toggle("is-on");
      exState.filters[field] = exState.filters[field] || [];
      var idx = exState.filters[field].indexOf(val);
      if (idx === -1) exState.filters[field].push(val); else exState.filters[field].splice(idx, 1);
      if (!exState.filters[field].length) delete exState.filters[field];
      drawExplorer();
    });
    document.getElementById("exReset").addEventListener("click", function () {
      exState.filters = {};
      fWrap.querySelectorAll(".chip.is-on").forEach(function (c) { c.classList.remove("is-on"); });
      drawExplorer();
    });
  }

  function drawExplorer() {
    var measure = MEASURES.filter(function (m) { return m.key === exState.measure; })[0];
    var group = GROUPS.filter(function (g) { return g.key === exState.group; })[0];
    var records = filt(R, exState.filters);

    // build groups
    var buckets = {};
    records.forEach(function (r) {
      var gv = r[group.key];
      if (!gv) return;
      (buckets[gv] = buckets[gv] || []).push(r);
    });
    var keys = (group.order || Object.keys(buckets)).filter(function (k) { return buckets[k] && buckets[k].length; });
    // sort by size when no fixed order
    if (!group.order) keys.sort(function (a, b) { return buckets[b].length - buckets[a].length; });

    var rows = keys.map(function (k) {
      var recs = buckets[k];
      if (measure.type === "mean") {
        var vals = recs.map(function (r) { return r.equality; }).filter(isNum);
        return { label: k, val: r1(mean(vals)), n: vals.length };
      } else {
        var elig = recs.filter(function (r) { return r[measure.key] && (!measure.exclude || measure.exclude.indexOf(r[measure.key]) === -1); });
        var hit = elig.filter(function (r) { return measure.target.indexOf(r[measure.key]) !== -1; });
        return { label: k, val: pct(hit.length, elig.length), n: elig.length };
      }
    }).filter(function (r) { return r.n > 0; });

    var totalN = records.length;
    document.getElementById("exN").textContent = "n = " + totalN;
    var isMean = measure.type === "mean";
    document.getElementById("exCaption").textContent =
      (isMean ? "Average equality rating" : measure.targetLabel) + " by " + group.label.toLowerCase();

    // small-sample warning
    var smallest = rows.reduce(function (m, r) { return Math.min(m, r.n); }, Infinity);
    var warn = document.getElementById("exWarn");
    if (rows.some(function (r) { return r.n < 15; })) {
      warn.hidden = false;
      warn.textContent = "Some groups here have fewer than 15 respondents — treat those bars as suggestive only.";
    } else { warn.hidden = true; }

    make("cExplore", {
      type: "bar",
      data: {
        labels: rows.map(function (r) { return shorten(r.label); }),
        datasets: [{
          data: rows.map(function (r) { return r.val; }),
          backgroundColor: rows.map(function (r, i) { return r.n < 15 ? "rgba(139,92,246,0.35)" : SEQ[i % SEQ.length]; }),
          borderColor: rows.map(function (r) { return r.n < 15 ? "rgba(167,139,250,0.6)" : "transparent"; }),
          borderWidth: rows.map(function (r) { return r.n < 15 ? 1.5 : 0; }),
          borderRadius: 8, borderSkipped: false, maxBarThickness: 80,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 24 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) {
            return " " + (isMean ? c.parsed.y + " / 10" : c.parsed.y + "%") + "  (n = " + rows[c.dataIndex].n + ")";
          } } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: C.ink, font: { size: 12 } } },
          y: { grid: { color: C.grid }, ticks: { color: C.tick, callback: function (v) { return isMean ? v : v + "%"; } }, beginAtZero: true, max: isMean ? 10 : 100 },
        },
      },
      plugins: [{
        id: "explabels", afterDatasetsDraw: function (chart) {
          var ctx = chart.ctx, meta = chart.getDatasetMeta(0);
          meta.data.forEach(function (bar, i) {
            ctx.save(); ctx.textAlign = "center";
            ctx.fillStyle = "#e9deff"; ctx.font = "600 12px Inter";
            ctx.fillText(rows[i].val + (isMean ? "" : "%"), bar.x, bar.y - 9);
            ctx.fillStyle = "#7d7391"; ctx.font = "500 10px Inter";
            ctx.fillText("n=" + rows[i].n, bar.x, bar.y - 24);
            ctx.restore();
          });
        },
      }],
    });
  }

  /* ================= NAV + REVEAL ================= */
  function initNav() {
    var nav = document.getElementById("nav");
    var toggle = document.getElementById("navToggle");
    var links = document.querySelector(".nav__links");
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("is-open");
      toggle.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.addEventListener("click", function (e) {
      if (e.target.tagName === "A") { links.classList.remove("is-open"); toggle.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); }
    });
    window.addEventListener("scroll", function () { nav.classList.toggle("is-scrolled", window.scrollY > 20); }, { passive: true });

    // scroll spy
    var sections = Array.prototype.slice.call(document.querySelectorAll("main section[id]"));
    var navLinks = Array.prototype.slice.call(document.querySelectorAll(".nav__links a"));
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var id = en.target.id;
          navLinks.forEach(function (a) { a.classList.toggle("is-active", a.getAttribute("href") === "#" + id); });
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { spy.observe(s); });
  }

  function initReveal() {
    var els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) { els.forEach(function (e) { e.classList.add("is-in"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("is-in");
          // animate theme bars when they appear
          en.target.querySelectorAll(".theme__fill").forEach(function (f) { f.style.width = f.getAttribute("data-w") + "%"; });
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    els.forEach(function (e) { io.observe(e); });
  }

  /* ================= INIT ================= */
  function init() {
    renderHero();
    renderDemographics();
    renderEquality();
    renderExperiences();
    renderSafety();
    renderConsent();
    renderVoices();
    renderFindings();
    buildExplorerControls();
    drawExplorer();
    initNav();
    initReveal();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
