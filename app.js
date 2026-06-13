/* app.js — 和暦カレンダー Web UI */

// ===== 状態・永続化 =====
const Store = {
  loadSettings() {
    try { return JSON.parse(localStorage.getItem("settings")) || {}; } catch { return {}; }
  },
  saveSettings(s) { localStorage.setItem("settings", JSON.stringify(s)); },
  loadEvents() {
    try { return JSON.parse(localStorage.getItem("userEvents")) || []; } catch { return []; }
  },
  saveEvents(evs) { localStorage.setItem("userEvents", JSON.stringify(evs)); },
};

const CAL_SOURCES = {
  privat: { name: "個人", color: "#c4633a" },
  work: { name: "仕事", color: "#3b6fd4" },
  family: { name: "家族", color: "#1f8a5b" },
};
const PRESET_EMOJIS = ["🍽️", "🤝", "🎂", "🍻", "🏥", "💼", "🧘", "✈️", "⚽️", "🎌", "📚", "🎵", "🐟", "⛩️"];
// 文字アイコン（休み・出勤など）。絵文字と同様にアイコン欄で使える
const PRESET_CHARS = ["休", "出", "有", "祝", "締", "稽"];
// 絵文字かどうか（文字アイコンは色付きバッジで描画する）
const isPictographic = (s) => /\p{Extended_Pictographic}/u.test(s);
// 月ごとの季節アイコン（月間ビュー左上にゆらゆら表示）
const MONTH_ICONS = ["", "🎍", "👹", "🎎", "🌸", "🎏", "☔️", "🎋", "🌻", "🌕", "🍁", "🍂", "⛄️"];

const state = {
  today: Koyomi.today(),
  dispY: 0, dispM: 0,
  sel: null,                 // 詳細表示中の日付 {y,m,d}
  settings: Object.assign({
    palette: "paper", density: "standard", font: "gothic", fontSize: "standard", regionId: "tokyo",
    // WebアプリのOAuthクライアントIDは公開して問題ない識別子（秘密情報ではない）
    gcalClientId: "60450009298-ap985moaa7nq31kpc2o4j8c0mnjd6emf.apps.googleusercontent.com",
  }, Store.loadSettings()),
  events: Store.loadEvents(),
  editingId: null,
};
state.dispY = state.today.y;
state.dispM = state.today.m;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// 時刻入力（時・分のドロップダウン）: OS標準の時刻ピッカーに依存しない
function timeSelectHTML(idPrefix, value) {
  const [h, m] = value.split(":").map(Number);
  const hOpts = Array.from({ length: 24 }, (_, i) =>
    `<option value="${i}" ${i === h ? "selected" : ""}>${String(i).padStart(2, "0")}</option>`).join("");
  const mOpts = Array.from({ length: 12 }, (_, i) => i * 5).map((mm) =>
    `<option value="${mm}" ${mm === m ? "selected" : ""}>${String(mm).padStart(2, "0")}</option>`).join("");
  return `<div class="time-select">
    <select id="${idPrefix}H">${hOpts}</select><span>:</span><select id="${idPrefix}M">${mOpts}</select>
  </div>`;
}
const timeSelectValue = (idPrefix) => `${$(idPrefix + "H").value.padStart(2, "0")}:${$(idPrefix + "M").value.padStart(2, "0")}`;
const sameDate = (a, b) => a && b && a.y === b.y && a.m === b.m && a.d === b.d;
// 繰り返し予定が指定日に発生するか（JSTにDSTがないため日数差はミリ秒で判定可）
const DAY_MS = 86400000;
function occursOn(e, dt) {
  const rep = e.repeat || "none";
  if (rep === "none") return e.y === dt.y && e.m === dt.m && e.d === dt.d;
  const start = new Date(e.y, e.m - 1, e.d);
  const t = new Date(dt.y, dt.m - 1, dt.d);
  if (t < start) return false;
  if (e.repeatUntil) { const u = new Date(e.repeatUntil + "T23:59:59"); if (t > u) return false; }
  switch (rep) {
    case "daily": return true;
    case "weekly": return Math.round((t - start) / DAY_MS) % 7 === 0;
    case "monthly": return t.getDate() === start.getDate();
    case "yearly": return t.getDate() === start.getDate() && t.getMonth() === start.getMonth();
    default: return false;
  }
}
const eventsFor = (dt) => state.events
  .filter((e) => occursOn(e, dt))
  .sort((a, b) => (a.min ?? -1) - (b.min ?? -1));

// 場所をGoogleマップで開くリンク（端末側でマップアプリ/Webが開く）
const placeLink = (place) => {
  if (!place) return "";
  const url = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(place);
  return `<a class="maplink" href="${url}" target="_blank" rel="noopener">📍 ${esc(place)}</a>　`;
};

// ===== 月SVG =====
function moonSVG(age, size, opts = {}) {
  const r = size / 2, cx = r, cy = r;
  const phase = (((age % 29.53) + 29.53) % 29.53) / 29.53;
  const cos = Math.cos(2 * Math.PI * phase);
  const rx = Math.max(0.4, r * Math.abs(cos));
  const waxing = phase < 0.5;
  const sweepLimb = waxing ? 1 : 0;                 // 満ち=右半円, 欠け=左半円
  const rightTerm = cos > 0 ? waxing : !waxing;     // 境界線が右に膨らむか
  const sweepTerm = rightTerm ? 0 : 1;
  const lit = `M ${cx},${cy - r} A ${r},${r} 0 0 ${sweepLimb} ${cx},${cy + r} A ${rx},${r} 0 0 ${sweepTerm} ${cx},${cy - r} Z`;
  // 反転表示: 影の部分を濃く、光っている部分を明るく描く
  const litColor = opts.ink || "var(--paper)";
  const ring = opts.ring
    ? `<circle cx="${cx}" cy="${cy}" r="${r - 0.8}" fill="none" stroke="${opts.ring}" stroke-width="1.4"/>`
    : `<circle cx="${cx}" cy="${cy}" r="${r - 0.4}" fill="none" stroke="var(--line)" stroke-width="0.8"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block">
    <circle cx="${cx}" cy="${cy}" r="${r - 0.4}" fill="var(--ink)" opacity="0.85"/>
    <path d="${lit}" fill="${litColor}"/>
    ${ring}
  </svg>`;
}

// ===== 月間ビュー =====
function renderMonth() {
  const y = state.dispY, m = state.dispM;
  $("eraLine").textContent = `${Koyomi.eraKanjiString(y)} ・ ${Koyomi.yearEtoKanji(y)}`;
  $("yLabel").textContent = y;
  $("mLabel").textContent = m;
  $("monthIcon").textContent = MONTH_ICONS[m];

  const days = Koyomi.month(y, m);
  $("wafuLabel").textContent = Koyomi.WAFU[days[0].lunar.m];

  $("weekRow").innerHTML = Koyomi.WD.map((w) => `<span>${w}</span>`).join("");

  const density = state.settings.density;
  const cells = [];
  for (let i = 0; i < days[0].weekday; i++) cells.push("<div></div>");
  for (const d of days) {
    const cls = ["cell"];
    if (d.isSunday || d.holiday) cls.push("sun");
    else if (d.isSaturday) cls.push("sat");
    if (sameDate(d.date, state.today)) cls.push("today");
    const rokuCls = d.rokuyo === "大安" ? "taian" : d.rokuyo === "仏滅" ? "butsu" : "";

    const gMarks = GCal.eventsFor(d.date).map(() => `<i style="background:${GCal.COLOR}"></i>`);
    const marks = eventsFor(d.date).map((e) => {
      const color = (CAL_SOURCES[e.cal] || {}).color || "var(--sub)";
      if (!e.emoji) return `<i style="background:${color}"></i>`;
      if (isPictographic(e.emoji)) return `<span>${esc(e.emoji)}</span>`;
      return `<b class="tmark" style="background:${color}">${esc(e.emoji)}</b>`;
    }).concat(gMarks).slice(0, 3).join("");

    let badge = "";
    if (d.sekki) badge = `<span class="sekki">${d.sekki.name}</span>`;
    else if (d.event) badge = `<span class="evdot"></span>`;

    // 旧暦15日=望（金色の満月）、旧暦1日=朔（新月）を強調
    const isFull = d.lunar.d === 15;
    const isNew = d.lunar.d === 1;
    const oldCls = isFull ? "old full" : isNew ? "old new" : "old";
    const oldTxt = isNew ? `${d.lunar.m}月` : d.lunar.d;
    const moonOpts = isFull ? { ink: "#e9b830", ring: "#e9b830" } : isNew ? { ring: "var(--red)" } : {};
    const mid = density === "simple" ? "" : `
      <div class="${oldCls}">${oldTxt}</div>
      <div class="moon">${moonSVG(d.moonAge, 12, moonOpts)}</div>`;

    cells.push(`<div class="${cls.join(" ")}" data-d="${d.day}">
      ${Weather.cellHTML(d.date)}
      ${density === "simple" ? "" : `<div class="roku ${rokuCls}">${d.rokuyo}</div>`}
      <div class="num">${d.day}</div>
      ${mid}
      <div class="marks">${marks}</div>
      <div class="badge">${badge}</div>
    </div>`);
  }
  $("grid").innerHTML = cells.join("");
  $("grid").querySelectorAll(".cell").forEach((el) => {
    el.addEventListener("click", () => openDetail({ y, m, d: Number(el.dataset.d) }));
  });
}

function moveMonth(delta) {
  let y = state.dispY, m = state.dispM + delta;
  if (m < 1) { m = 12; y -= 1; }
  if (m > 12) { m = 1; y += 1; }
  state.dispY = y; state.dispM = m;
  renderMonth();
  GCal.syncMonth();
}

// ===== 日詳細 =====
function openDetail(dt) {
  state.sel = dt;
  renderDetail();
  $("detailScreen").classList.add("open");
}
function closeDetail() {
  $("detailScreen").classList.remove("open");
  state.sel = null;
}

function moveDay(delta) {
  if (!state.sel) return;
  const d = new Date(state.sel.y, state.sel.m - 1, state.sel.d + delta);
  state.sel = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  // 月をまたいだら背後の月間ビューも追従させる
  if (state.sel.y !== state.dispY || state.sel.m !== state.dispM) {
    state.dispY = state.sel.y;
    state.dispM = state.sel.m;
    renderMonth();
  }
  renderDetail();
  $("dBody").scrollTop = 0;
}

function renderDetail() {
  const dt = state.sel;
  if (!dt) return;
  const d = Koyomi.dayData(dt);
  const rid = state.settings.regionId;
  const tides = Koyomi.tides(dt, rid);
  const sunT = Koyomi.sun(dt, rid);
  const reg = Koyomi.region(rid);
  const density = state.settings.density;
  const userEvs = eventsFor(dt);

  $("dTitle").textContent = `${dt.m}月${dt.d}日`;

  const wdCls = d.isSunday || d.holiday ? "sun" : d.isSaturday ? "sat" : "";

  // 予定カード
  const legend = Object.entries(CAL_SOURCES).map(([, s]) =>
    `<span><i style="background:${s.color}"></i>${s.name}</span>`).join("");
  let evRows = "";
  for (const e of userEvs) {
    const c = CAL_SOURCES[e.cal] || { color: "var(--sub)", name: "" };
    const time = e.min == null ? "終日" : Koyomi.fmtTime(e.min);
    const endT = e.min != null && e.end != null ? `<small>${Koyomi.fmtTime(e.end)}</small>` : "";
    const repLabel = { daily: "毎日", weekly: "毎週", monthly: "毎月", yearly: "毎年" }[e.repeat];
    evRows += `<div class="evrow" data-eid="${esc(e.id)}">
      <div class="bar" style="background:${c.color}"></div>
      <div class="time">${time}${endT}</div>
      <div class="et">${e.emoji ? esc(e.emoji) + " " : ""}${esc(e.title)}${repLabel ? ` <span class="rep-tag">↻${repLabel}</span>` : ""}
        <small>${placeLink(e.place)}${c.name}</small></div>
    </div>`;
  }
  // Googleカレンダーの予定（読み取り専用）
  let gRows = "";
  for (const e of GCal.eventsFor(dt)) {
    const time = e.min == null ? "終日" : Koyomi.fmtTime(e.min);
    const endT = e.min != null && e.end != null ? `<small>${Koyomi.fmtTime(e.end)}</small>` : "";
    gRows += `<div class="evrow">
      <div class="bar" style="background:${GCal.COLOR}"></div>
      <div class="time">${time}${endT}</div>
      <div class="et">${esc(e.title)}<small>${placeLink(e.place)}Google</small></div>
    </div>`;
  }
  const gLegend = GCal.connected ? `<span><i style="background:${GCal.COLOR}"></i>Google</span>` : "";
  const schedule = `<div class="card">
    <div class="chead"><span class="ctitle serif">予定</span><span class="legend">${legend}${gLegend}</span></div>
    ${evRows + gRows || `<div class="noev">この日の予定はありません（右上の＋で追加）</div>`}
  </div>`;

  // 情報行
  const lunarRow = `<div class="irow" data-info="lunar">
    <div class="lbl serif">旧暦</div>
    <div><div class="main">${d.lunar.leap ? "閏" : ""}${d.lunar.m}月${d.lunar.d}日
      <small>${Koyomi.WAFU[d.lunar.m]}・${Koyomi.kanjiNum(d.lunar.d)}日</small></div>
      ${density !== "simple" ? `<div class="note">${d.lunar.d === 1 ? "朔（新月）" : d.lunar.d === 15 ? "望（満月）" : "月の満ち欠けで数える暦"}</div>` : ""}
    </div></div>`;

  const sekkiRow = `<div class="irow" data-info="sekki">
    <div class="lbl serif">節気</div>
    <div><div class="main">${d.sekki ? `<span class="sekki-badge">${d.sekki.name}</span>` : ""}${d.kou.name}
      <small>${d.kou.yomi}</small></div>
      ${density !== "simple" ? `<div class="note">${d.kou.group}　${d.sekki ? d.sekki.note : d.kou.note}</div>` : ""}
    </div></div>`;

  const moonRow = `<div class="irow" data-info="moon">
    <div class="lbl serif">月相</div>
    <div style="flex:1"><div class="main">${d.moonPhase.name}
      <small>${d.moonPhase.yomi || d.moonPhase.alt}</small></div>
      ${density !== "simple" ? `<div class="note">月齢 ${d.moonAge.toFixed(1)}${d.moonPhase.alt && d.moonPhase.yomi ? "　" + d.moonPhase.alt : ""}</div>` : ""}
    </div>
    <div class="moonbig">${moonSVG(d.moonAge, 48)}</div></div>`;

  // 暦グリッド
  const kcells = [
    ["六曜", d.rokuyo, d.rokuyoYomi, d.rokuyo === "大安", "rokuyo"],
    ["干支", d.eto.kanji, d.eto.yomi, false, "eto"],
    ["九星", d.kyusei.s, d.kyusei.n, false, "kyusei"],
    ["中段", d.choku, "十二直・" + d.chokuYomi, false, "choku"],
    ["宿", d.shuku + "宿", "二十八宿・" + d.shukuYomi, false, "shuku"],
  ].map(([l, v, s, taian, kind]) =>
    `<div class="kcell" data-info="${kind}"><div class="l serif">${l}</div>
     <div class="v serif ${taian ? "taian" : ""}">${v}</div><div class="s">${s}</div></div>`).join("");

  // 選日
  const chips = d.senjitsu.length
    ? d.senjitsu.map((s, i) => {
      const cls = ["chip", s.type === "吉" ? "ok" : "ng"];
      if (s.big) cls.push("big");
      return `<span class="${cls.join(" ")}" data-sen="${i}"><i></i>${s.name}</span>`;
    }).join("")
    : `<span class="chip">特段の暦注なし</span>`;

  // 潮汐
  const curve = Koyomi.tideCurve(dt, rid, 64);
  const W = 320, H = 80, padT = 8, padB = 18, padX = 4;
  const span = Math.max(1, curve.max - curve.min);
  const X = (mn) => padX + (mn / 1440) * (W - padX * 2);
  const Y = (lv) => padT + (1 - (lv - curve.min) / span) * (H - padT - padB);
  let path = "";
  curve.pts.forEach((p, i) => { path += (i ? "L" : "M") + X(p.min).toFixed(1) + " " + Y(p.level).toFixed(1) + " "; });
  const area = path + `L ${X(1440)} ${H - padB} L ${X(0)} ${H - padB} Z`;
  const gridLines = [0, 6, 12, 18, 24].map((h) =>
    `<line x1="${X(h * 60)}" y1="${padT - 4}" x2="${X(h * 60)}" y2="${H - padB}" stroke="var(--line2)"/>
     <text x="${X(h * 60)}" y="${H - 5}" font-size="9" fill="var(--sub)" text-anchor="middle">${h}時</text>`).join("");
  const dots = tides.events.map((e) =>
    `<circle cx="${X(e.min)}" cy="${Y(e.level)}" r="3.1" fill="${e.type === "満潮" ? "var(--red)" : "var(--sat)"}" stroke="var(--paper)" stroke-width="1.4"/>`).join("");
  const tideSVG = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;margin-top:4px">
    <defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--red)" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="var(--red)" stop-opacity="0.02"/></linearGradient></defs>
    ${gridLines}<path d="${area}" fill="url(#tg)"/>
    <path d="${path}" fill="none" stroke="var(--red)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`;
  const tcells = density === "simple" ? "" : `<div class="tide-cells">${tides.events.map((e) =>
    `<div class="tcell"><div class="tt ${e.type === "満潮" ? "hi" : "lo"}">${e.type}</div>
     <div class="tv">${Koyomi.fmtTime(e.min)}</div><div class="tl">${e.level}cm</div></div>`).join("")}</div>`;

  $("dBody").innerHTML = `
    <div class="hero">
      <div class="era serif">${Koyomi.eraKanjiString(dt.y)}　${dt.y} 年 ${dt.m} 月</div>
      <div class="big ${wdCls}">${dt.d}</div>
      <div class="sub">
        <span class="sub-side"></span>
        <span class="wd serif ${wdCls}">${d.weekdayLabel}曜日</span>
        <span class="sub-side right">
          ${d.holiday ? `<span class="ev serif" style="color:var(--red)">◆ ${d.holiday}</span>` : ""}
          ${d.event ? `<span class="ev serif">◆ ${d.event}</span>` : ""}
          <span class="tide-chip" data-info="tide">潮 ${tides.name}</span>
        </span>
      </div>
    </div>
    <div class="dnav">
      <button id="dPrev">&#10094; 前日</button>
      <button id="dNext">翌日 &#10095;</button>
    </div>
    ${schedule}
    ${lunarRow}${sekkiRow}${moonRow}
    <div class="kgrid">${kcells}</div>
    <div class="senrow"><span class="lbl serif">選日・下段</span><div class="chips">${chips}</div></div>
    <div class="card">
      <div class="tide-head">
        <span class="t serif">〜 潮汐<small>${reg.name}・${reg.bay}</small></span>
        <span class="tide-pill ${tides.name === "大潮" ? "oo" : ""}">${tides.name}</span>
      </div>
      ${tideSVG}${tcells}
      <div class="dfoot">
        <span>日の出 <b>${Koyomi.fmtTime(sunT.rise)}</b>　日の入 <b>${Koyomi.fmtTime(sunT.set)}</b></span>
        <span>干満差 <b>${tides.range}cm</b></span>
      </div>
    </div>
    <div class="disclaimer">※ 潮汐・日の出入りは簡易計算による目安です。航海・釣行などの判断には気象庁・海上保安庁の公式情報をご利用ください。</div>`;

  // タップハンドラ
  $("dBody").querySelectorAll("[data-info]").forEach((el) => {
    el.addEventListener("click", () => showInfo(el.dataset.info, d));
  });
  $("dBody").querySelectorAll("[data-sen]").forEach((el) => {
    el.addEventListener("click", (ev) => { ev.stopPropagation(); showSenInfo(d.senjitsu[Number(el.dataset.sen)]); });
  });
  $("dBody").querySelectorAll("[data-eid]").forEach((el) => {
    el.addEventListener("click", (ev) => {
      if (ev.target.closest(".maplink")) return; // 地図リンクのタップは編集を開かない
      openEventSheet(el.dataset.eid);
    });
  });
  $("dPrev").addEventListener("click", () => moveDay(-1));
  $("dNext").addEventListener("click", () => moveDay(1));
}

// ===== 解説モーダル =====
function showModal(cat, term, yomi, desc, catDesc) {
  $("infoModal").innerHTML = `
    <div class="cat serif">${cat}</div>
    <div class="term serif">${term}</div>
    <div class="yomi">${yomi || ""}</div>
    <div class="desc">${desc}</div>
    ${catDesc ? `<div class="catdesc">${catDesc}</div>` : ""}
    <button class="close" id="infoClose">閉じる</button>`;
  $("infoOverlay").classList.add("open");
  $("infoClose").addEventListener("click", () => $("infoOverlay").classList.remove("open"));
}

function showInfo(kind, d) {
  const C = Koyomi.CAT[kind];
  if (!C) return;
  switch (kind) {
    case "rokuyo": return showModal(C.label, d.rokuyo, d.rokuyoYomi, d.rokuyoNote, C.desc);
    case "choku": return showModal(C.label, d.choku, d.chokuYomi, d.chokuNote, C.desc);
    case "shuku": return showModal(C.label, d.shuku + "宿", d.shukuYomi, d.shukuNote, C.desc);
    case "kyusei": return showModal(C.label, d.kyusei.n, d.kyusei.y, d.kyusei.note, C.desc);
    case "eto": return showModal(C.label, d.eto.kanji, d.eto.yomi,
      `六十干支の第${d.eto.no}番。日の性質を表し、選日や暦注下段の多くがこの干支を基準に定まる。本日の支は「${d.eto.animal}」。`, C.desc);
    case "lunar": return showModal(C.label, `${d.lunar.leap ? "閏" : ""}${d.lunar.m}月${d.lunar.d}日`,
      `${Koyomi.WAFU[d.lunar.m]}・${Koyomi.kanjiNum(d.lunar.d)}日`,
      d.lunar.d === 1 ? "朔（さく）。新月にあたる旧暦月の一日。" : d.lunar.d === 15 ? "望（ぼう）。ほぼ満月にあたる日。" : `新月（朔）から数えて${d.lunar.d}日目。`, C.desc);
    case "sekki": return showModal(C.label, d.sekki ? d.sekki.name : d.kou.name,
      d.sekki ? d.sekki.yomi : d.kou.yomi,
      `${d.sekki ? d.sekki.note : d.kou.note}（${d.kou.group}「${d.kou.name}」）`, C.desc);
    case "moon": return showModal(C.label, d.moonPhase.name, d.moonPhase.yomi,
      `月齢 ${d.moonAge.toFixed(1)}（新月からの経過日数）。${d.moonPhase.alt ? `古くは「${d.moonPhase.alt}」とも。` : ""}`, C.desc);
    case "tide": return showModal(C.label, d.tideName, "",
      "旧暦の日付（月の満ち欠け）から定まる潮回り。", C.desc);
  }
}
function showSenInfo(s) {
  showModal("選日・暦注下段", s.name, s.type === "吉" ? "吉日" : "凶日", s.note, Koyomi.CAT.senjitsu.desc);
}

// ===== 予定シート =====
function openEventSheet(editId = null) {
  state.editingId = editId;
  const dt = state.sel;
  const ev = editId ? state.events.find((e) => e.id === editId) : null;
  const v = {
    title: ev ? ev.title : "",
    allDay: ev ? ev.min == null : false,
    start: ev && ev.min != null ? Koyomi.fmtTime(ev.min) : "09:00",
    end: ev && ev.end != null ? Koyomi.fmtTime(ev.end) : "10:00",
    cal: ev ? ev.cal : "privat",
    emoji: ev ? ev.emoji || "" : "",
    place: ev ? ev.place || "" : "",
    repeat: ev ? ev.repeat || "none" : "none",
    repeatUntil: ev ? ev.repeatUntil || "" : "",
  };
  const repOpts = [["none", "なし"], ["daily", "毎日"], ["weekly", "毎週"], ["monthly", "毎月"], ["yearly", "毎年"]]
    .map(([k, l]) => `<option value="${k}" ${v.repeat === k ? "selected" : ""}>${l}</option>`).join("");
  const calOpts = Object.entries(CAL_SOURCES).map(([k, s]) =>
    `<option value="${k}" ${v.cal === k ? "selected" : ""}>${s.name}</option>`).join("");
  const emojiBtns = PRESET_EMOJIS.map((e) =>
    `<button type="button" data-emoji="${e}" class="${v.emoji === e ? "sel" : ""}">${e}</button>`).join("")
    + PRESET_CHARS.map((c) =>
    `<button type="button" data-emoji="${c}" class="tpre ${v.emoji === c ? "sel" : ""}">${c}</button>`).join("");

  $("evSheet").innerHTML = `
    <h3>${ev ? "予定を編集" : `${dt.m}月${dt.d}日の予定`}</h3>
    <div class="frow"><label>タイトル</label><input type="text" id="evTitle" value="${esc(v.title)}" placeholder="予定名"></div>
    <div class="frow"><label>終日</label><input type="checkbox" id="evAllDay" ${v.allDay ? "checked" : ""}></div>
    <div class="frow" id="timeRow1"><label>開始</label>${timeSelectHTML("evStart", v.start)}</div>
    <div class="frow" id="timeRow2"><label>終了</label>${timeSelectHTML("evEnd", v.end)}</div>
    <div class="frow"><label>場所</label><input type="text" id="evPlace" value="${esc(v.place)}" placeholder="例: 渋谷"></div>
    <div class="frow"><label>繰り返し</label><select id="evRepeat">${repOpts}</select></div>
    <div class="frow" id="repUntilRow"><label>繰り返しの終了</label><input type="date" id="evRepeatUntil" value="${v.repeatUntil}"></div>
    <div class="frow"><label>カレンダー</label><select id="evCal">${calOpts}</select></div>
    <div class="frow" style="border:none"><label>アイコン</label><input type="text" id="evEmoji" value="${esc(v.emoji)}" placeholder="絵文字" style="max-width:80px;text-align:center"></div>
    <div class="emoji-row" id="emojiRow">${emojiBtns}</div>
    <div class="sheet-actions">
      <button class="btn-cancel" id="evCancel">キャンセル</button>
      <button class="btn-save" id="evSave">${ev ? "保存" : "追加"}</button>
    </div>
    ${ev ? `<button class="btn-delete" id="evDelete">予定を削除</button>` : ""}`;

  const syncTimeRows = () => {
    const hide = $("evAllDay").checked;
    $("timeRow1").style.display = hide ? "none" : "";
    $("timeRow2").style.display = hide ? "none" : "";
  };
  syncTimeRows();
  $("evAllDay").addEventListener("change", syncTimeRows);
  const syncRepeatRow = () => {
    $("repUntilRow").style.display = $("evRepeat").value === "none" ? "none" : "";
  };
  syncRepeatRow();
  $("evRepeat").addEventListener("change", syncRepeatRow);
  $("emojiRow").querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      $("evEmoji").value = b.dataset.emoji;
      $("emojiRow").querySelectorAll("button").forEach((x) => x.classList.toggle("sel", x === b));
    });
  });
  $("evCancel").addEventListener("click", closeEventSheet);
  $("evSave").addEventListener("click", saveEvent);
  if (ev) $("evDelete").addEventListener("click", () => {
    const target = state.events.find((e) => e.id === editId);
    if (target && GCal.connected) GCal.remove(target);
    state.events = state.events.filter((e) => e.id !== editId);
    Store.saveEvents(state.events);
    closeEventSheet(); renderDetail(); renderMonth();
  });
  $("evOverlay").classList.add("open");
}

function closeEventSheet() { $("evOverlay").classList.remove("open"); state.editingId = null; }

function saveEvent() {
  const dt = state.sel;
  const title = $("evTitle").value.trim();
  if (!title) { $("evTitle").focus(); return; }
  const allDay = $("evAllDay").checked;
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  let min = null, end = null;
  if (!allDay) {
    min = toMin(timeSelectValue("evStart"));
    end = toMin(timeSelectValue("evEnd"));
    if (end <= min) end = min + 60;
  }
  const emoji = [...$("evEmoji").value.trim()].slice(0, 2).join("") || null; // サロゲート対応で先頭1絵文字
  const editing = state.editingId ? state.events.find((e) => e.id === state.editingId) : null;
  const repeat = $("evRepeat").value;
  const repeatUntil = repeat !== "none" ? ($("evRepeatUntil").value || null) : null;
  // 編集時は元の開始日を維持（繰り返しインスタンスから開いても基準日がずれないように）
  const base = editing || dt;
  const ev = {
    id: state.editingId || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    y: base.y, m: base.m, d: base.d, min, end, title,
    cal: $("evCal").value, emoji,
    place: $("evPlace").value.trim() || null,
    repeat, repeatUntil,
    gcalId: editing ? editing.gcalId || null : null,
  };
  if (state.editingId) {
    state.events = state.events.map((e) => (e.id === state.editingId ? ev : e));
  } else {
    state.events.push(ev);
  }
  Store.saveEvents(state.events);
  closeEventSheet(); renderDetail(); renderMonth();
  // Googleカレンダーへ反映（非同期・失敗してもローカルは保持）
  if (GCal.connected) {
    (ev.gcalId ? GCal.update(ev) : GCal.push(ev)).then((gid) => {
      if (gid && gid !== ev.gcalId) {
        state.events = state.events.map((e) => (e.id === ev.id ? { ...e, gcalId: gid } : e));
        Store.saveEvents(state.events);
      }
    });
  }
}

// ===== Googleカレンダー連携 =====
// クライアントIDは設定画面で入力（localStorageに保存）。トークンはブラウザ内のみ。
const GCal = {
  COLOR: "#4285f4",
  cache: new Map(),          // "y-m" -> [{d, min, end, title}]
  tokenClient: null,

  get clientId() { return (state.settings.gcalClientId || "").trim(); },
  get token() {
    try { return JSON.parse(localStorage.getItem("gcalToken")); } catch { return null; }
  },
  set token(t) {
    if (t) localStorage.setItem("gcalToken", JSON.stringify(t));
    else localStorage.removeItem("gcalToken");
  },
  get connected() { return !!this.token; },
  get tokenValid() { const t = this.token; return t && t.expires_at > Date.now() + 60000; },
  // 一度接続したかどうか（トークン失効後も「再接続が必要」を出すために保持）
  get enabled() { return localStorage.getItem("gcalEnabled") === "1"; },
  set enabled(v) {
    if (v) localStorage.setItem("gcalEnabled", "1");
    else localStorage.removeItem("gcalEnabled");
  },

  showReconnect() { const b = document.getElementById("gcalBanner"); if (b) b.hidden = false; },
  hideReconnect() { const b = document.getElementById("gcalBanner"); if (b) b.hidden = true; },

  /// アクセストークンを取得（interactive=trueでポップアップ許可）
  ensureToken(interactive) {
    return new Promise((resolve) => {
      if (this.tokenValid) return resolve(this.token.access_token);
      if (!this.clientId || !window.google?.accounts?.oauth2) return resolve(null);
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: "https://www.googleapis.com/auth/calendar.events",
        callback: (resp) => {
          if (resp.access_token) {
            this.token = { access_token: resp.access_token, expires_at: Date.now() + (resp.expires_in - 60) * 1000 };
            resolve(resp.access_token);
          } else resolve(null);
        },
        error_callback: () => resolve(null),
      });
      this.tokenClient.requestAccessToken({ prompt: interactive ? "consent" : "" });
    });
  },

  async api(path, opts = {}) {
    // 失効していればサイレント再取得を試みる。失敗したら再接続バナーを表示
    const tok = await this.ensureToken(false);
    if (!tok) { if (this.enabled) this.showReconnect(); return null; }
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary" + path, {
      ...opts,
      headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json", ...(opts.headers || {}) },
    });
    if (res.status === 401) {
      this.token = null;
      if (this.enabled) this.showReconnect();
      return null;
    }
    this.hideReconnect();
    if (res.status === 204) return {};
    return res.ok ? res.json() : null;
  },

  /// 表示月のGoogle予定を取得（このアプリから書き込んだ分は除外して二重表示を防ぐ）
  async fetchMonth(y, m) {
    const key = `${y}-${m}`;
    const pad = (n) => String(n).padStart(2, "0");
    const last = Koyomi.daysInMonth(y, m);
    const q = new URLSearchParams({
      timeMin: `${y}-${pad(m)}-01T00:00:00+09:00`,
      timeMax: `${y}-${pad(m)}-${pad(last)}T23:59:59+09:00`,
      singleEvents: "true", orderBy: "startTime", maxResults: "250",
    });
    const data = await this.api(`/events?${q}`);
    if (!data) return null;
    const evs = [];
    for (const it of data.items || []) {
      if (it.extendedProperties?.private?.koyomiId) continue; // 自分が書いた予定
      if (it.status === "cancelled") continue;
      let d, min = null, end = null;
      if (it.start?.dateTime) {
        const s = new Date(it.start.dateTime), e = new Date(it.end?.dateTime || it.start.dateTime);
        d = s.getDate(); min = s.getHours() * 60 + s.getMinutes(); end = e.getHours() * 60 + e.getMinutes();
        if (s.getMonth() + 1 !== m) continue;
      } else if (it.start?.date) {
        const s = new Date(it.start.date + "T00:00:00");
        d = s.getDate();
        if (s.getMonth() + 1 !== m) continue;
      } else continue;
      evs.push({ d, min, end, title: it.summary || "(無題)", place: it.location || null });
    }
    this.cache.set(key, evs);
    return evs;
  },

  eventsFor(dt) {
    return (this.cache.get(`${dt.y}-${dt.m}`) || []).filter((e) => e.d === dt.d);
  },

  toBody(ev) {
    const pad = (n) => String(n).padStart(2, "0");
    const date = `${ev.y}-${pad(ev.m)}-${pad(ev.d)}`;
    const body = {
      summary: (ev.emoji ? ev.emoji + " " : "") + ev.title,
      location: ev.place || undefined,
      extendedProperties: { private: { koyomiId: ev.id } },
    };
    if (ev.min == null) {
      body.start = { date };
      const next = new Date(ev.y, ev.m - 1, ev.d + 1);
      body.end = { date: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}` };
    } else {
      const t = (mins) => `${date}T${pad(Math.floor(mins / 60))}:${pad(mins % 60)}:00+09:00`;
      body.start = { dateTime: t(ev.min), timeZone: "Asia/Tokyo" };
      body.end = { dateTime: t(ev.end ?? ev.min + 60), timeZone: "Asia/Tokyo" };
    }
    // 繰り返し（RRULE）
    if (ev.repeat && ev.repeat !== "none") {
      const freq = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY" }[ev.repeat];
      let rule = `RRULE:FREQ=${freq}`;
      if (ev.repeatUntil) rule += `;UNTIL=${ev.repeatUntil.replace(/-/g, "")}T235959Z`;
      body.recurrence = [rule];
    } else {
      body.recurrence = null; // 編集で繰り返し解除した場合に消す
    }
    return body;
  },

  async push(ev) {
    if (!this.connected) return null;
    const r = await this.api("/events", { method: "POST", body: JSON.stringify(this.toBody(ev)) });
    return r?.id || null;
  },
  async update(ev) {
    if (!this.connected || !ev.gcalId) return this.push(ev);
    const r = await this.api(`/events/${ev.gcalId}`, { method: "PATCH", body: JSON.stringify(this.toBody(ev)) });
    return r?.id || null;
  },
  async remove(ev) {
    if (!this.connected || !ev.gcalId) return;
    await this.api(`/events/${ev.gcalId}`, { method: "DELETE" });
  },

  /// 表示月を取得してUIを更新
  async syncMonth() {
    if (!this.enabled || !this.clientId) return;
    const r = await this.fetchMonth(state.dispY, state.dispM);
    if (r) { renderMonth(); if (state.sel) renderDetail(); }
  },

  disconnect() {
    this.token = null;
    this.enabled = false;
    this.cache.clear();
    this.hideReconnect();
    renderMonth(); if (state.sel) renderDetail();
  },
};

// ===== 週間天気（Open-Meteo・無料/キー不要） =====
const Weather = {
  // WMO天気コード → 絵文字
  icon(code) {
    if (code === 0) return "☀️";
    if (code === 1 || code === 2) return "🌤️";
    if (code === 3) return "☁️";
    if (code === 45 || code === 48) return "🌫️";
    if (code >= 51 && code <= 57) return "🌦️";
    if (code >= 61 && code <= 67) return "🌧️";
    if (code >= 71 && code <= 77) return "❄️";
    if (code >= 80 && code <= 82) return "🌦️";
    if (code === 85 || code === 86) return "🌨️";
    if (code >= 95) return "⛈️";
    return "🌡️";
  },

  async load(force) {
    const r = Koyomi.region(state.settings.regionId);
    const key = "wx_" + r.id;
    try {
      const c = JSON.parse(localStorage.getItem(key));
      if (!force && c && Date.now() - c.t < 3 * 3600 * 1000) { this.render(c.data); return; }
    } catch {}
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${r.lat}&longitude=${r.lng}`
      + `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FTokyo&forecast_days=7`;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const j = await res.json();
      if (!j.daily) return;
      localStorage.setItem(key, JSON.stringify({ t: Date.now(), data: j.daily }));
      this.render(j.daily);
    } catch {}
  },

  byDate: {},  // "y-m-d" -> { code, max, min }

  render(daily) {
    this.byDate = {};
    if (daily && daily.time) {
      for (let i = 0; i < daily.time.length; i++) {
        const [y, m, d] = daily.time[i].split("-").map(Number);
        this.byDate[`${y}-${m}-${d}`] = {
          code: daily.weather_code[i],
          max: daily.temperature_2m_max[i],
          min: daily.temperature_2m_min[i],
        };
      }
    }
    renderMonth();  // セルに天気アイコンを反映
  },

  // セル用の天気HTML（予報のある日だけ）
  cellHTML(dt) {
    const w = this.byDate[`${dt.y}-${dt.m}-${dt.d}`];
    if (!w) return "";
    return `<div class="wx-ic">${this.icon(w.code)}<b>${Math.round(w.max)}°</b></div>`;
  },
};

// ===== スワイプ =====
// 横スワイプ（縦スクロールと区別するため、横移動が大きく縦移動が小さい時のみ発火）
function addSwipe(el, onLeft, onRight) {
  let sx = 0, sy = 0, st = 0;
  el.addEventListener("touchstart", (e) => {
    const p = e.touches[0];
    sx = p.clientX; sy = p.clientY; st = Date.now();
  }, { passive: true });
  el.addEventListener("touchend", (e) => {
    const p = e.changedTouches[0];
    const dx = p.clientX - sx, dy = p.clientY - sy;
    if (Date.now() - st < 600 && Math.abs(dx) > 60 && Math.abs(dy) < 50) {
      (dx < 0 ? onLeft : onRight)();
    }
  }, { passive: true });
}

// ===== 設定 =====
function applySettings() {
  const s = state.settings;
  document.body.dataset.palette = s.palette;
  document.body.dataset.density = s.density;
  document.body.dataset.font = s.font;
  document.body.style.zoom = { small: 0.9, standard: 1, large: 1.13 }[s.fontSize] || 1;
  document.querySelector('meta[name="theme-color"]').setAttribute("content",
    getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#faf6ec");
}

function initSettingsSheet() {
  $("setRegion").innerHTML = Koyomi.REGIONS.map((r) =>
    `<option value="${r.id}">${r.name}・${r.bay}</option>`).join("");
  $("setPalette").value = state.settings.palette;
  $("setDensity").value = state.settings.density;
  $("setFont").value = state.settings.font;
  $("setFontSize").value = state.settings.fontSize;
  $("setRegion").value = state.settings.regionId;
  const onChange = () => {
    state.settings = {
      palette: $("setPalette").value, density: $("setDensity").value,
      font: $("setFont").value, fontSize: $("setFontSize").value,
      regionId: $("setRegion").value,
    };
    Store.saveSettings(state.settings);
    applySettings(); renderMonth();
    if (state.sel) renderDetail();
    Weather.load();  // 地域変更で天気も更新
  };
  ["setPalette", "setDensity", "setFont", "setFontSize", "setRegion"].forEach((id) =>
    $(id).addEventListener("change", onChange));
  $("gearBtn").addEventListener("click", () => { updateGcalStatus(); $("setOverlay").classList.add("open"); });
  $("setClose").addEventListener("click", () => $("setOverlay").classList.remove("open"));
  // 再読み込み: ページ全体をリロードしてアプリの最新版を反映
  $("reloadBtn").addEventListener("click", () => location.reload());

  // Googleカレンダー連携
  const updateGcalStatus = () => {
    $("gcalStatus").textContent = !GCal.clientId
      ? "未設定: Google CloudのOAuthクライアントIDを入力してください"
      : GCal.connected ? "接続済み（予定の追加・編集・削除がGoogleカレンダーに反映されます）"
      : "未接続: 「接続して同期」をタップしてGoogleにログインしてください";
    $("gcalConnect").textContent = GCal.connected ? "同期済み" : "接続して同期";
  };
  $("setGcalId").value = state.settings.gcalClientId || "";
  $("setGcalId").addEventListener("change", () => {
    state.settings.gcalClientId = $("setGcalId").value.trim();
    Store.saveSettings(state.settings);
    updateGcalStatus();
  });
  $("gcalConnect").addEventListener("click", async () => {
    state.settings.gcalClientId = $("setGcalId").value.trim();
    Store.saveSettings(state.settings);
    if (!GCal.clientId) { updateGcalStatus(); return; }
    $("gcalStatus").textContent = "Googleにログイン中…";
    const tok = await GCal.ensureToken(true);
    if (tok) {
      GCal.enabled = true;
      GCal.hideReconnect();
      await GCal.syncMonth();
      $("gcalStatus").textContent = "接続しました。今月の予定を同期済みです";
      $("gcalConnect").textContent = "同期済み";
    } else {
      $("gcalStatus").textContent = "接続できませんでした（クライアントIDと許可設定を確認してください）";
    }
  });
  $("gcalDisconnect").addEventListener("click", () => {
    GCal.disconnect();
    updateGcalStatus();
  });
  updateGcalStatus();
}

// ===== ホーム画面に追加 =====
const Install = {
  deferred: null,  // Android: beforeinstallprompt イベント
  get standalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  },
  get isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); },

  // 設定の追加ボタンの表示/非表示を更新
  refresh() {
    const btn = $("installBtn");
    if (!btn) return;
    btn.hidden = this.standalone;  // すでにホーム画面アプリなら隠す
  },

  // ボタン押下時の挙動：Androidはネイティブ確認、iOS等は手順案内
  async onClick() {
    if (this.deferred) {
      this.deferred.prompt();
      await this.deferred.userChoice;
      this.deferred = null;
      this.refresh();
      return;
    }
    this.showGuide();
  },

  showGuide() {
    const shareIcon = `<svg class="ios-share" width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 16V3M12 3l-4 4M12 3l4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>`;
    const steps = this.isIOS
      ? [`Safari下部の共有ボタン ${shareIcon} をタップ`,
         "メニューを下にスクロール",
         "「ホーム画面に追加」をタップ",
         "右上の「追加」をタップ"]
      : ["ブラウザのメニュー（⋮）を開く",
         "「アプリをインストール」または「ホーム画面に追加」をタップ"];
    $("installModal").innerHTML = `
      <div class="cat serif">ホーム画面に追加</div>
      <div class="term serif" style="font-size:18px">アプリのように使えます</div>
      <div class="yomi">追加すると全画面で起動し、オフラインでも開けます。</div>
      ${steps.map((s, i) => `<div class="step"><b>${i + 1}</b><span>${s}</span></div>`).join("")}
      <button class="close" id="installClose">閉じる</button>`;
    $("installOverlay").classList.add("open");
    $("installClose").addEventListener("click", () => $("installOverlay").classList.remove("open"));
  },
};

// ===== 起動 =====
function init() {
  applySettings();
  initSettingsSheet();
  renderMonth();
  $("prevBtn").addEventListener("click", () => moveMonth(-1));
  $("nextBtn").addEventListener("click", () => moveMonth(1));
  $("backBtn").addEventListener("click", closeDetail);
  $("addEvBtn").addEventListener("click", () => openEventSheet(null));
  $("dGearBtn").addEventListener("click", () => $("gearBtn").click()); // 月間ビューと同じ設定を開く
  // 左スワイプ=次へ / 右スワイプ=前へ
  addSwipe(document.querySelector(".grid-wrap"), () => moveMonth(1), () => moveMonth(-1));
  addSwipe($("dBody"), () => moveDay(1), () => moveDay(-1));
  [["evOverlay", closeEventSheet],
   ["setOverlay", () => $("setOverlay").classList.remove("open")],
   ["infoOverlay", () => $("infoOverlay").classList.remove("open")],
   ["installOverlay", () => $("installOverlay").classList.remove("open")]].forEach(([id, fn]) => {
    $(id).addEventListener("click", (e) => { if (e.target === $(id)) fn(); });
  });
  // ホーム画面に追加
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); Install.deferred = e; });
  window.addEventListener("appinstalled", () => { Install.deferred = null; Install.refresh(); });
  $("installBtn").addEventListener("click", () => Install.onClick());
  Install.refresh();
  // 日付が変わったら「本日」を更新
  setInterval(() => {
    const t = Koyomi.today();
    if (!sameDate(t, state.today)) { state.today = t; renderMonth(); }
  }, 60000);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  Weather.load();  // 週間天気を読み込み
  // Google連携済みなら表示月を取得（GISスクリプトの読込を少し待つ）
  if (GCal.enabled && GCal.clientId) setTimeout(() => GCal.syncMonth(), 800);
  // アプリを前面に戻したとき・タブに戻ったときに自動同期（サイレント再取得込み）
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") GCal.syncMonth();
  });
  // 再接続バナーのタップで対話的に再認証
  $("gcalBanner").addEventListener("click", async () => {
    const tok = await GCal.ensureToken(true);
    if (tok) { GCal.hideReconnect(); GCal.syncMonth(); }
  });
}
init();
