/* Animated RSP mechanism figure.
   (a) Generation: attention from the token being generated. The arcs onto the RSP tokens follow the measured
       RSP/question attention ratio; the side curve is the measured total attention on the RSP tokens (paper Fig. 3,
       Qwen2.5-Math-7B, suffix, L = 10; data: hjkim00/RSP_backup attention_mass_heatmap/cache_perproblem/no_boxed_no_last2).
   (b) Exploration (schematic): RSP and Baseline samples side by side, with the spread of their paths over generation. */
(function () {
  var root = document.getElementById("rsp-mechanism");
  if (!root) return;

  var NS = "http://www.w3.org/2000/svg";
  var W = 1200, H = 600;
  var N_IN = 4, N_RSP = 3, STEPS = 20, N_PATHS = 8, S8 = 8 / STEPS;
  var N_FIX = 3, N_TAIL = 3, N_SLOTS = N_FIX + 1 + N_TAIL; // y1 y2 y3 … y(t-2) y(t-1) y(t)
  var TOK_W = 40, TOK_GAP = 6, TOK_H = 32, TOK_Y = 150, PITCH = TOK_W + TOK_GAP;
  var ROW_W = (N_IN + N_RSP + N_SLOTS) * PITCH - TOK_GAP + 20;
  var X_IN = Math.round(40 + (760 - ROW_W) / 2), X_RSP = X_IN + N_IN * PITCH + 10, X_GEN = X_RSP + N_RSP * PITCH + 10;
  var X_TAIL = X_GEN + (N_FIX + 1) * PITCH, DOTS_X = X_GEN + N_FIX * PITCH + TOK_W / 2;
  var WIN_X0 = X_TAIL - 3, WIN_W = N_TAIL * PITCH - TOK_GAP + 6;
  var CH = { x: 900, y: 70, w: 250, h: 120 };
  var BY = 290, IS_X = 150, GOAL_X = 780;
  var LANES = [{ y: 372, label: "RSP", spread: 62, jit: 5 }, { y: 496, label: "Baseline", spread: 10, jit: 2 }];
  var DV = { x: 900, y: 352, w: 250, h: 140 };
  var SCRUB_Y = 572, SCRUB_X0 = 40, SCRUB_X1 = 1090;
  var COL = { red: "#e0564f", blue: "#3c6fd6", rsp: "#d0642f", input: "#eceef1", inputStroke: "#b7bec7",
              ink: "#11110f", text: "#41413d", faint: "#8a8a84", star: "#f0a63a", base: "#9aa3ad" };
  var FONT = '"Times New Roman", Times, "Nimbus Roman", "Liberation Serif", serif';
  var STEP_MS = 420, HOLD_MS = 2400;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var t = 0, playing = !reduced, lastTick = 0, holdUntil = 0, draw = null, svg;

  // ---------- helpers ----------
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(x, y, str, attrs, parent) {
    var a = { x: x, y: y, fill: COL.text, "font-size": 16, "font-family": FONT };
    for (var k in attrs) a[k] = attrs[k];
    var e = el("text", a, parent || svg); e.textContent = str; return e;
  }
  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function lerpColor(a, b, u) {
    var A = hex(a), B = hex(b), r = [];
    for (var i = 0; i < 3; i++) r.push(Math.round(A[i] + (B[i] - A[i]) * Math.max(0, Math.min(1, u))));
    return "rgb(" + r.join(",") + ")";
  }
  function genColor(i) { return lerpColor(COL.red, COL.blue, i / (STEPS - 1)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function rand(seed) { var x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); }
  function lerp(a, b, u) { return a + (b - a) * u; }

  // measured attention per reasoning-position quintile (mean over heads, layers and problems)
  var MEAS = { pos: [0.1, 0.3, 0.5, 0.7, 0.9],
               rspTotal: [0.0242, 0.0098, 0.0075, 0.0062, 0.0063],
               rspTok: [0.00242, 0.00098, 0.00075, 0.00062, 0.00063],
               qTok: [0.01193, 0.00963, 0.00896, 0.00866, 0.00836] };
  function interp(xs, ys, u) {
    if (u <= xs[0]) return ys[0];
    for (var i = 1; i < xs.length; i++) if (u <= xs[i]) return lerp(ys[i - 1], ys[i], (u - xs[i - 1]) / (xs[i] - xs[i - 1]));
    return ys[ys.length - 1];
  }
  function mass(tf) { return interp(MEAS.pos, MEAS.rspTotal, tf / STEPS); }
  function rspRatio(tf) { return interp(MEAS.pos, MEAS.rspTok, tf / STEPS) / interp(MEAS.pos, MEAS.qTok, tf / STEPS); }

  function newDraw() {
    function lane() {
      var order = [];
      for (var k = 0; k < N_PATHS; k++) order.push(k);
      for (k = order.length - 1; k > 0; k--) { var j = Math.floor(Math.random() * (k + 1)), tmp = order[k]; order[k] = order[j]; order[j] = tmp; }
      return order.map(function (slot) { return { d: ((slot + 0.5) / N_PATHS) * 2 - 1 + (Math.random() - 0.5) * 0.18, j: Math.random() * 1000 }; });
    }
    var w = [], sum = 0;
    for (var k = 0; k < N_RSP; k++) { var v = 0.7 + Math.random() * 0.6; w.push(v); sum += v; }
    draw = { lanes: [lane(), lane()], rspW: w.map(function (v) { return v / sum; }) };
  }

  // ---------- scaffold ----------
  svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Animated RSP mechanism" }, root);
  var defs = el("defs", {}, svg);
  var trajGrad = el("linearGradient", { id: "rsp-traj", gradientUnits: "userSpaceOnUse", x1: IS_X, x2: GOAL_X, y1: 0, y2: 0 }, defs);
  el("stop", { offset: "0%", "stop-color": COL.red }, trajGrad); el("stop", { offset: "45%", "stop-color": "#8a63b4" }, trajGrad); el("stop", { offset: "100%", "stop-color": COL.blue }, trajGrad);
  var chipGrad = el("linearGradient", { id: "rsp-chip", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el("stop", { offset: "0%", "stop-color": "#fff1e6" }, chipGrad); el("stop", { offset: "100%", "stop-color": "#fbd9c0" }, chipGrad);
  var clip = el("clipPath", { id: "rsp-win" }, defs);
  el("rect", { x: WIN_X0, y: TOK_Y - 6, width: WIN_W, height: TOK_H + 12 }, clip);
  var dots = el("pattern", { id: "rsp-dots", width: 22, height: 22, patternUnits: "userSpaceOnUse" }, defs);
  el("circle", { cx: 1.2, cy: 1.2, r: 1.2, fill: "#d9d9d3" }, dots);
  var fadeGrad = el("linearGradient", { id: "rsp-fade", x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
  el("stop", { offset: "0%", "stop-color": "#fff", "stop-opacity": 1 }, fadeGrad); el("stop", { offset: "100%", "stop-color": "#fff", "stop-opacity": 0 }, fadeGrad);

  // ===== (a) =====
  text(40, 34, "(a) Generation", { "font-size": 21, "font-weight": 600, fill: COL.ink });
  var gArcsPrev = el("g", { fill: "none", "stroke-linecap": "round" }, svg);
  var gArcs = el("g", { fill: "none", "stroke-linecap": "round" }, svg);
  var gChips = el("g", {}, svg);

  for (var i = 0; i < N_IN; i++) {
    var x = X_IN + i * PITCH;
    el("rect", { x: x, y: TOK_Y, width: TOK_W, height: TOK_H, rx: 8, fill: COL.input, stroke: COL.inputStroke }, gChips);
    text(x + TOK_W / 2, TOK_Y + 21, i === N_IN - 1 ? "xᵀ" : (i === N_IN - 2 ? "…" : "x" + (i + 1)), { "text-anchor": "middle", "font-size": 16, "font-style": "italic", fill: "#4a525c" }, gChips);
  }
  for (i = 0; i < N_RSP; i++) {
    x = X_RSP + i * PITCH;
    el("rect", { x: x, y: TOK_Y, width: TOK_W, height: TOK_H, rx: 8, fill: "url(#rsp-chip)", stroke: COL.rsp, "stroke-width": 1.3 }, gChips);
    text(x + TOK_W / 2, TOK_Y + 21, i === N_RSP - 1 ? "hʟ" : (i === N_RSP - 2 ? "…" : "h" + (i + 1)), { "text-anchor": "middle", "font-size": 16, "font-style": "italic", fill: "#a94f1c" }, gChips);
  }
  text(X_IN + (N_IN * PITCH - TOK_GAP) / 2, TOK_Y + TOK_H + 22, "prompt", { "text-anchor": "middle", "font-size": 13.5, fill: COL.faint });
  var RSP_CX = X_RSP + (N_RSP * PITCH - TOK_GAP) / 2;
  text(RSP_CX, TOK_Y + TOK_H + 22, "random soft prompt", { "text-anchor": "middle", "font-size": 13.5, fill: COL.faint });
  text(X_GEN + (N_SLOTS * PITCH - TOK_GAP) / 2, TOK_Y + TOK_H + 22, "generated tokens", { "text-anchor": "middle", "font-size": 13.5, fill: COL.faint });

  var gFix = el("g", {}, gChips), gWin = el("g", { "clip-path": "url(#rsp-win)" }, gChips);
  var genChips = [];
  for (i = 0; i < STEPS; i++) {
    var g = el("g", { opacity: 0 }, i < N_FIX ? gFix : gWin);
    var gr = el("rect", { x: 0, y: TOK_Y, width: TOK_W, height: TOK_H, rx: 8, fill: "#fff", stroke: genColor(i), "stroke-width": 1.5 }, g);
    var gt = text(TOK_W / 2, TOK_Y + 21, "", { "text-anchor": "middle", "font-size": 16, "font-style": "italic", fill: genColor(i) }, g);
    var main = document.createElementNS(NS, "tspan"), sub = document.createElementNS(NS, "tspan");
    sub.setAttribute("font-size", 10.5); sub.setAttribute("dy", 4); gt.appendChild(main); gt.appendChild(sub);
    genChips.push({ g: g, rect: gr, main: main, sub: sub, label: "" });
  }
  el("rect", { x: WIN_X0, y: TOK_Y - 6, width: 30, height: TOK_H + 12, fill: "url(#rsp-fade)" }, gWin);
  var dotsMark = text(DOTS_X, TOK_Y + 22, "…", { "text-anchor": "middle", "font-size": 18, fill: COL.faint, opacity: 0 });

  // Tokens 0..N_FIX-1 sit in fixed slots. Later tokens flow through a N_TAIL-slot window after the "…":
  // the token being generated takes the last slot and the older ones slide left (and out) one slot per step.
  function curIdx(tf) { return Math.min(STEPS - 1, Math.floor(tf)); }
  var FIRST_SCROLL = N_FIX + N_TAIL; // the first token index that forces a slide
  function scrollAt(tf) {
    var q = curIdx(tf), frac = tf - Math.floor(tf);
    if (q < FIRST_SCROLL) return 0;
    return (q - FIRST_SCROLL) + (tf >= STEPS ? 1 : smooth(frac / 0.5));
  }
  function popStart(tf) { return curIdx(tf) >= FIRST_SCROLL && tf < STEPS ? 0.5 : 0; }
  function tokenX(i, tf) {
    if (i < N_FIX) return X_GEN + i * PITCH;
    var q = curIdx(tf);
    if (i === q) return X_TAIL + Math.min(q - N_FIX, N_TAIL - 1) * PITCH;
    return X_TAIL + (i - N_FIX - scrollAt(tf)) * PITCH;
  }
  function visible(i, tf) { return i < N_FIX || tokenX(i, tf) >= WIN_X0 - 2; }

  var N_RECENT = 2, N_TARGETS = 1 + N_RSP + N_RECENT, PROMPT_CX = X_IN + (N_IN * PITCH - TOK_GAP) / 2;
  function makeArcs(parent) { var a = []; for (var k = 0; k < N_TARGETS; k++) a.push(el("path", { d: "", opacity: 0 }, parent)); return a; }
  var arcsPrev = makeArcs(gArcsPrev), arcsCur = makeArcs(gArcs);
  function arcPath(xq, xt) {
    var h = Math.min(62, 14 + 0.12 * (xq - xt));
    return "M" + xq.toFixed(1) + "," + TOK_Y + " C" + xq.toFixed(1) + "," + (TOK_Y - h).toFixed(1) + " " + xt.toFixed(1) + "," + (TOK_Y - h).toFixed(1) + " " + xt.toFixed(1) + "," + TOK_Y;
  }
  function arcsFor(q, tf) {
    var ratio = rspRatio(tf), list = [{ x: PROMPT_CX, w: 14, col: "#dde1e6", op: 0.7 }];
    for (var k = 0; k < N_RSP; k++) list.push({ x: X_RSP + k * PITCH + TOK_W / 2, w: 1.2 + 11 * ratio * draw.rspW[k] * N_RSP, col: COL.rsp, op: 0.95 });
    for (k = 1; k <= N_RECENT; k++) {
      var i = q - k;
      list.push(i < 0 || !visible(i, tf) ? null : { x: tokenX(i, tf) + TOK_W / 2, w: 3 - 0.8 * (k - 1), col: genColor(i), op: 0.45 });
    }
    return list;
  }
  function paintArcs(arcs, q, fade) {
    if (q < 0 || fade <= 0) { arcs.forEach(function (p) { p.setAttribute("opacity", 0); }); return; }
    var xq = tokenX(q, t) + TOK_W / 2, list = arcsFor(q, Math.max(q, Math.min(t, q + 1)));
    arcs.forEach(function (p, k) {
      var a = list[k];
      if (!a) { p.setAttribute("opacity", 0); return; }
      p.setAttribute("d", arcPath(xq, a.x)); p.setAttribute("stroke", a.col); p.setAttribute("stroke-width", a.w.toFixed(2));
      p.setAttribute("opacity", (fade * a.op).toFixed(3));
    });
  }

  // attention curve (measured)
  text(CH.x, 34, "Attention on RSP tokens", { "font-size": 17.5, "font-weight": 600, fill: COL.ink });
  text(CH.x, 52, "Qwen2.5-Math-7B, measured", { "font-size": 13, fill: COL.faint });
  var Y_MAX = 0.03;
  function cx(tf) { return CH.x + (tf / STEPS) * CH.w; }
  function cy(v) { return CH.y + CH.h - (v / Y_MAX) * CH.h; }
  el("line", { x1: CH.x, x2: CH.x + CH.w, y1: cy(0), y2: cy(0), stroke: "#c9c9c3" }, svg);
  text(CH.x - 6, cy(0) + 4, "0", { "text-anchor": "end", "font-size": 13, fill: COL.faint });
  text(CH.x - 6, cy(Y_MAX) + 4, "3%", { "text-anchor": "end", "font-size": 13, fill: COL.faint });
  text(CH.x, CH.y + CH.h + 18, "start", { "font-size": 13, fill: COL.faint });
  text(CH.x + CH.w, CH.y + CH.h + 18, "end of generation", { "text-anchor": "end", "font-size": 13, fill: COL.faint });
  var chartArea = el("path", { d: "", fill: COL.rsp, opacity: 0.08 }, svg);
  var chartCurve = el("path", { d: "", fill: "none", stroke: COL.rsp, "stroke-width": 2.6, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
  var chartHead = el("circle", { r: 4.5, fill: COL.rsp }, svg);
  var chartValue = text(0, 0, "", { "font-size": 15, "font-weight": 600, fill: COL.rsp });

  // ===== (b) =====
  text(40, BY, "(b) Exploration", { "font-size": 21, "font-weight": 600, fill: COL.ink });
  text(190, BY, "same prompt, 8 samples each", { "font-size": 15, fill: COL.faint });
  var starBase = [];
  for (i = 0; i < 10; i++) { var r = i % 2 ? 8 : 19, a = -Math.PI / 2 + i * Math.PI / 5; starBase.push([r * Math.cos(a), r * Math.sin(a)]); }
  function starPts(cxp, cyp) { return starBase.map(function (p) { return (cxp + p[0]).toFixed(1) + "," + (cyp + p[1]).toFixed(1); }).join(" "); }
  el("rect", { x: 40, y: BY + 22, width: 800, height: 236, rx: 12, fill: "url(#rsp-dots)", opacity: 0.7 }, svg);
  var gTraj = el("g", { fill: "none", "stroke-linecap": "round" }, svg);
  var halo, stars = [];
  LANES.forEach(function (L, li) {
    var isRsp = li === 0;
    text(40, L.y + 5, L.label, { "font-size": 16, "font-weight": 600, fill: isRsp ? COL.rsp : "#5b6670" });
    if (isRsp) halo = el("circle", { cx: IS_X, cy: L.y, r: 24, fill: COL.rsp, opacity: 0 }, svg);
    el("circle", { cx: IS_X, cy: L.y, r: 14, fill: "#fff", stroke: isRsp ? COL.red : COL.base, "stroke-width": 2 }, svg);
    stars.push(el("polygon", { points: starPts(GOAL_X, L.y), fill: "#fff", stroke: COL.star, "stroke-width": 2, "stroke-linejoin": "round" }, svg));
  });
  text(IS_X, LANES[1].y + 36, "prompt", { "text-anchor": "middle", "font-size": 13, fill: COL.faint });
  text(GOAL_X, LANES[1].y + 36, "answer", { "text-anchor": "middle", "font-size": 13, fill: COL.faint });

  // diversity curves (schematic)
  text(DV.x, BY, "Spread of the paths", { "font-size": 17.5, "font-weight": 600, fill: COL.ink });
  function dx(tf) { return DV.x + (tf / STEPS) * DV.w; }
  function dy(v) { return DV.y + DV.h - clamp(v, 0, 1) * DV.h; }
  el("line", { x1: DV.x, x2: DV.x + DV.w, y1: dy(0), y2: dy(0), stroke: "#c9c9c3" }, svg);
  text(DV.x, DV.y + DV.h + 18, "start", { "font-size": 13, fill: COL.faint });
  text(DV.x + DV.w, DV.y + DV.h + 18, "end of generation", { "text-anchor": "end", "font-size": 13, fill: COL.faint });
  var dvGap = el("path", { d: "", fill: COL.rsp, opacity: 0.08 }, svg);
  var dvCurves = [el("path", { d: "", fill: "none", stroke: COL.rsp, "stroke-width": 2.6, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg),
                  el("path", { d: "", fill: "none", stroke: COL.base, "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg)];
  var dvHeads = [el("circle", { r: 4.5, fill: COL.rsp }, svg), el("circle", { r: 4, fill: COL.base }, svg)];
  var dvLabels = [text(0, 0, "RSP", { "font-size": 15, "font-weight": 600, fill: COL.rsp, opacity: 0 }),
                  text(0, 0, "Baseline", { "font-size": 15, "font-weight": 600, fill: "#5b6670", opacity: 0 })];

  // ---------- scrubber ----------
  var gScrub = el("g", { style: "cursor: pointer" }, svg);
  el("rect", { x: SCRUB_X0 - 10, y: SCRUB_Y - 16, width: SCRUB_X1 - SCRUB_X0 + 20, height: 32, fill: "transparent" }, gScrub);
  el("line", { x1: SCRUB_X0, x2: SCRUB_X1, y1: SCRUB_Y, y2: SCRUB_Y, stroke: "#e1e1db", "stroke-width": 3, "stroke-linecap": "round" }, gScrub);
  var scrubFill = el("line", { x1: SCRUB_X0, x2: SCRUB_X0, y1: SCRUB_Y, y2: SCRUB_Y, stroke: COL.ink, "stroke-width": 3, "stroke-linecap": "round" }, gScrub);
  function sx(tf) { return SCRUB_X0 + (tf / STEPS) * (SCRUB_X1 - SCRUB_X0); }
  var knob = el("circle", { cx: SCRUB_X0, cy: SCRUB_Y, r: 7, fill: "#fff", stroke: COL.ink, "stroke-width": 2 }, gScrub);
  var scrubText = text(SCRUB_X1 + 16, SCRUB_Y + 5, "", { "font-size": 15, fill: COL.text });

  // ---------- trajectories ----------
  var traj = [[], []];
  function catmull(pts) {
    var d = "M" + pts[0][0].toFixed(1) + "," + pts[0][1].toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      var c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += " C" + c1[0].toFixed(1) + "," + c1[1].toFixed(1) + " " + c2[0].toFixed(1) + "," + c2[1].toFixed(1) + " " + p2[0].toFixed(1) + "," + p2[1].toFixed(1);
    }
    return d;
  }
  function buildTraj() {
    while (gTraj.firstChild) gTraj.removeChild(gTraj.firstChild);
    traj = [[], []];
    var x0 = IS_X + 16, x1 = GOAL_X - 22;
    LANES.forEach(function (L, li) {
      var isRsp = li === 0;
      draw.lanes[li].forEach(function (s) {
        var pts = [[x0, L.y]];
        for (var i = 1; i <= STEPS; i++) {
          var i8 = i * S8, env = (1 - Math.exp(-i8 / 0.8)) * Math.exp(-(i8 - 1) / 3.2);
          var jit = (rand(s.j + i) - 0.5) * L.jit * Math.exp(-i8 / 5);
          pts.push([lerp(x0, x1, i / STEPS), L.y + s.d * L.spread * env + jit + s.d * (isRsp ? 4 : 1.5) * (1 - i / STEPS)]);
        }
        var p = el("path", { d: catmull(pts), stroke: isRsp ? "url(#rsp-traj)" : COL.base, "stroke-width": isRsp ? 2 : 1.8, opacity: isRsp ? 0.9 : 0.8 }, gTraj);
        var len = p.getTotalLength();
        p.setAttribute("stroke-dasharray", len); p.setAttribute("stroke-dashoffset", len);
        traj[li].push({ path: p, len: len, pts: pts });
      });
    });
  }
  function spreadAt(li, tf) {
    var i0 = Math.floor(clamp(tf, 0, STEPS)), i1 = Math.min(STEPS, i0 + 1), f = clamp(tf - i0, 0, 1);
    function sd(i) {
      var ys = traj[li].map(function (tr) { return tr.pts[i][1]; }), m = ys.reduce(function (a, b) { return a + b; }, 0) / ys.length;
      return Math.sqrt(ys.reduce(function (a, y) { return a + (y - m) * (y - m); }, 0) / ys.length);
    }
    return clamp(lerp(sd(i0), sd(i1), f) / 42, 0, 1);
  }

  // ---------- render ----------
  function render(tf) {
    var step = Math.min(STEPS, Math.floor(tf)), frac = clamp(tf - step, 0, 1), u = clamp(tf / STEPS, 0, 1);

    // (a)
    var q = curIdx(tf), ps = popStart(tf);
    genChips.forEach(function (c, i) {
      if (i > q) { c.g.setAttribute("opacity", 0); return; }
      var x = tokenX(i, tf), isCur = i === q && tf < STEPS;
      c.g.setAttribute("opacity", (i >= N_FIX && x + TOK_W < WIN_X0 ? 0 : (isCur ? smooth((frac - ps) / 0.4) : 1)).toFixed(3));
      c.g.setAttribute("transform", "translate(" + x.toFixed(1) + ",0)");
      c.rect.setAttribute("fill", i === q ? "#f4f1fb" : "#fff");
      var lab = i < N_FIX ? String(i + 1) : (q - i === 0 ? "t" : "t−" + (q - i)); // y1..y3, then y(t−k)
      if (lab !== c.label) { c.label = lab; var rel = i >= N_FIX; c.main.textContent = rel ? "y" : "y" + lab; c.sub.textContent = rel ? lab : ""; }
    });
    dotsMark.setAttribute("opacity", q >= N_FIX ? smooth((tf - N_FIX) / 0.6) : 0);
    paintArcs(arcsCur, q, tf >= STEPS ? 1 : smooth((frac - ps) / 0.4));
    paintArcs(arcsPrev, q - 1, tf >= STEPS ? 0 : 1 - smooth(frac / 0.5));

    var dArea = "M" + cx(0) + "," + cy(0), dCurve = "";
    for (var s2 = 0; s2 <= tf + 1e-6; s2 += 0.25) { var pv = cy(mass(Math.min(s2, tf))); dCurve += (dCurve ? " L" : "M") + cx(s2).toFixed(1) + "," + pv.toFixed(1); dArea += " L" + cx(s2).toFixed(1) + "," + pv.toFixed(1); }
    var vEnd = mass(tf); dCurve += " L" + cx(tf).toFixed(1) + "," + cy(vEnd).toFixed(1); dArea += " L" + cx(tf).toFixed(1) + "," + cy(vEnd).toFixed(1) + " L" + cx(tf).toFixed(1) + "," + cy(0) + " Z";
    chartCurve.setAttribute("d", dCurve); chartArea.setAttribute("d", dArea);
    chartHead.setAttribute("cx", cx(tf)); chartHead.setAttribute("cy", cy(vEnd));
    chartValue.textContent = (vEnd * 100).toFixed(1) + "%";
    var late = tf > STEPS * 0.75;
    chartValue.setAttribute("text-anchor", late ? "end" : "start");
    chartValue.setAttribute("x", cx(tf) + (late ? -9 : 9)); chartValue.setAttribute("y", cy(vEnd) - 7);

    // (b)
    LANES.forEach(function (L, li) {
      traj[li].forEach(function (tr) { tr.path.setAttribute("stroke-dashoffset", (tr.len * (1 - u)).toFixed(1)); });
      stars[li].setAttribute("fill", u >= 1 ? "#fff1d6" : "#fff");
    });
    var w0 = mass(tf) / MEAS.rspTotal[0];
    halo.setAttribute("opacity", (w0 * 0.18).toFixed(3)); halo.setAttribute("r", (17 + 16 * w0).toFixed(1));

    var dR = "", dB = "", back = [];
    for (s2 = 0; s2 <= tf + 1e-6; s2 += 0.25) {
      var sv = Math.min(s2, tf), vr = spreadAt(0, sv), vb = spreadAt(1, sv);
      dR += (dR ? " L" : "M") + dx(sv).toFixed(1) + "," + dy(vr).toFixed(1);
      dB += (dB ? " L" : "M") + dx(sv).toFixed(1) + "," + dy(vb).toFixed(1);
      back.unshift(dx(sv).toFixed(1) + "," + dy(vb).toFixed(1));
    }
    var vrE = spreadAt(0, tf), vbE = spreadAt(1, tf);
    dR += " L" + dx(tf).toFixed(1) + "," + dy(vrE).toFixed(1); dB += " L" + dx(tf).toFixed(1) + "," + dy(vbE).toFixed(1);
    dvCurves[0].setAttribute("d", dR); dvCurves[1].setAttribute("d", dB);
    dvGap.setAttribute("d", dR + " L" + dx(tf).toFixed(1) + "," + dy(vbE).toFixed(1) + (back.length ? " L" + back.join(" L") : "") + " Z");
    [vrE, vbE].forEach(function (v, k) { dvHeads[k].setAttribute("cx", dx(tf)); dvHeads[k].setAttribute("cy", dy(v)); });
    // fixed labels: RSP above its early peak, Baseline under its flat curve
    var tR = STEPS * 0.15, tB = STEPS * 0.45;
    dvLabels[0].setAttribute("x", dx(tR) + 8); dvLabels[0].setAttribute("y", dy(spreadAt(0, tR)) - 8); dvLabels[0].setAttribute("opacity", smooth((tf - tR) / 1.5));
    dvLabels[1].setAttribute("x", dx(tB)); dvLabels[1].setAttribute("y", dy(spreadAt(1, tB)) + 18); dvLabels[1].setAttribute("opacity", smooth((tf - tB) / 1.5));

    knob.setAttribute("cx", sx(tf)); scrubFill.setAttribute("x2", sx(tf));
    scrubText.textContent = Math.round(u * 100) + "%";
  }

  // ---------- loop + controls ----------
  function tick(now) {
    if (!lastTick) lastTick = now;
    var dt = now - lastTick; lastTick = now;
    if (playing) {
      if (holdUntil) { if (now >= holdUntil) { holdUntil = 0; t = 0; } }
      else { t += dt / STEP_MS; if (t >= STEPS) { t = STEPS; holdUntil = now + HOLD_MS; } }
    }
    render(t);
    requestAnimationFrame(tick);
  }
  var controls = document.getElementById("rsp-mechanism-controls");
  var btnPlay = document.createElement("button"); btnPlay.type = "button"; controls.appendChild(btnPlay);
  function setPlaying(p) { playing = p; btnPlay.textContent = p ? "Pause" : "Play"; }
  btnPlay.addEventListener("click", function () { if (!playing && t >= STEPS) { t = 0; holdUntil = 0; } setPlaying(!playing); });
  setPlaying(playing);

  var scrubbing = false;
  function scrubTo(evt) {
    var pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    var p = pt.matrixTransform(svg.getScreenCTM().inverse());
    t = clamp((p.x - SCRUB_X0) / (SCRUB_X1 - SCRUB_X0), 0, 1) * STEPS; holdUntil = 0;
    render(t);
  }
  gScrub.addEventListener("pointerdown", function (e) { scrubbing = true; setPlaying(false); gScrub.setPointerCapture && gScrub.setPointerCapture(e.pointerId); scrubTo(e); e.preventDefault(); });
  gScrub.addEventListener("pointermove", function (e) { if (scrubbing) scrubTo(e); });
  window.addEventListener("pointerup", function () { scrubbing = false; });

  newDraw(); buildTraj();
  if (reduced) { t = STEPS; render(t); } else { render(0); requestAnimationFrame(tick); }
  window.__rspMechanism = { setStep: function (s) { setPlaying(false); t = s; render(s); } };
})();
