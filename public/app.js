// Злой инвестор — интерфейс. Весь текст выводится через textContent (без innerHTML).
(function () {
  "use strict";

  var PERSONAS = [
    { id: "angel", emoji: "😈", name: "Бизнес-ангел", fear: "Боится, что вы бросите проект после диплома", scene: "Демо-день, частный инвестор" },
    { id: "corp", emoji: "🏢", name: "Корпорация", fear: "Боится интеграции на год и рисков для данных", scene: "Переговоры с крупной компанией" },
    { id: "grant", emoji: "📋", name: "Грантовый фонд", fear: "Боится нецелевых расходов и сорванных сроков", scene: "Грантовый конкурс, «Стартап как диплом»" },
    { id: "vc", emoji: "📈", name: "Венчурный фонд", fear: "Боится, что рынок мал и бизнес не масштабируется", scene: "Питч венчурному фонду" },
    { id: "custom", emoji: "🛠", name: "Свой инвестор", fear: "Настройте характер и важные критерии сами", scene: "Если никто не подходит" }
  ];
  var CRITERIA = ["Реалистичность решения", "Бизнес-модель", "Рынок и конкуренты", "Финмодель", "ИС / регистрация",
    "Первые продажи", "Риски", "Горизонт расчёта", "Уникальность", "Инвест. привлекательность"];
  var N = 5, TIMER = 60;

  var state = { persona: null, focus: [], pitch: "", turns: [], busy: false, retry: null, timerId: null };
  var $ = function (id) { return document.getElementById(id); };
  fetch("/api/chat").then(function (r) { return r.json(); }).then(function (h) {
    if ($("mode")) $("mode").textContent = h.mock ? "ДЕМО-РЕЖИМ: ИИ НЕ ПОДКЛЮЧЁН" : (h.llm_configured ? "" : "ИИ НЕ ПОДКЛЮЧЁН");
  }).catch(function () { if ($("mode")) $("mode").textContent = "СЕРВЕР НЕДОСТУПЕН"; });

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function show(id) {
    document.querySelectorAll(".screen").forEach(function (s) { s.classList.remove("active"); });
    $(id).classList.add("active");
    window.scrollTo(0, 0);
  }
  function store(key, value) {
    try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (e) { return null; }
  }

  // ---------- 1. выбор инвестора ----------
  PERSONAS.forEach(function (p) {
    var b = el("button", "card");
    b.type = "button";
    b.appendChild(el("b", null, p.emoji + " " + p.name));
    b.appendChild(el("span", null, p.fear + ". Готовит к: " + p.scene + "."));
    b.onclick = function () {
      state.persona = p;
      document.querySelectorAll(".card").forEach(function (c) { c.classList.remove("selected"); });
      b.classList.add("selected");
      $("custom-box").classList.toggle("hidden", p.id !== "custom");
      $("to-pitch").disabled = false;
      $("top-avatar").textContent = p.emoji;
    };
    $("persona-cards").appendChild(b);
  });
  CRITERIA.forEach(function (name, i) {
    var c = el("button", "chip", name);
    c.type = "button";
    c.onclick = function () {
      var id = i + 1, at = state.focus.indexOf(id);
      if (at >= 0) state.focus.splice(at, 1);
      else if (state.focus.length < 3) state.focus.push(id);
      c.classList.toggle("on", state.focus.indexOf(id) >= 0);
    };
    $("focus-list").appendChild(c);
  });
  $("to-pitch").onclick = function () { show("s-pitch"); };
  $("back-persona").onclick = function () { show("s-persona"); };

  function personaPayload() {
    var p = { id: state.persona ? state.persona.id : "angel" };
    if (p.id === "custom") {
      p.custom = { who: $("c-who").value, wants: $("c-wants").value, fears: $("c-fears").value, behavior: $("c-behavior").value, focus: state.focus.slice() };
    }
    return p;
  }

  // ---------- сервер ----------
  function api(action) {
    return fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: action, persona: personaPayload(), pitch: state.pitch, turns: state.turns })
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, reason: "error", message: "Сервер ответил непонятно. Попробуйте ещё раз." }; });
    }).catch(function () {
      return { ok: false, reason: "network", message: "Нет связи с сервером. Проверьте интернет и нажмите «Повторить»." };
    });
  }
  function setBusy(b) {
    state.busy = b;
    $("status").textContent = b ? "печатает…" : "тренажёр перед защитой";
    $("send").disabled = b; $("start").disabled = b;
  }

  // ---------- 2. питч ----------
  $("pitch").addEventListener("input", function () { $("pitch-count").textContent = $("pitch").value.length + " / 5000"; });
  $("start").onclick = function () {
    if (state.busy) return;
    state.pitch = $("pitch").value.trim();
    $("pitch-error").classList.add("hidden");
    if (state.pitch.length < 200) return pitchError("Мне нечего прожаривать. Нужно хотя бы 200 символов: кто клиент, какая боль, что вы делаете.");
    state.turns = [];
    setBusy(true);
    api("start").then(function (d) {
      setBusy(false);
      if (!d.ok) return pitchError(d.message || "Не получилось начать.");
      $("chat").textContent = "";
      show("s-chat");
      if (d.message) bubble(d.message, "bot");
      ask(d.question, d.n || 1);
    });
  };
  function pitchError(text) { $("pitch-error").textContent = text; $("pitch-error").classList.remove("hidden"); setBusy(false); }

  // ---------- 3. чат ----------
  function bubble(text, who, extra) {
    var m = el("div", "msg " + who + (extra ? " " + extra : ""), text);
    $("chat").appendChild(m);
    m.scrollIntoView({ behavior: "smooth", block: "end" });
    return m;
  }
  function ask(question, n) {
    state.turns.push({ q: question, a: "" });
    $("q-num").textContent = "Вопрос " + n + " из " + N;
    bubble(question, "bot", "q");
    startTimer();
    $("answer").focus();
  }
  function startTimer() {
    clearInterval(state.timerId);
    var left = TIMER;
    $("timer").textContent = left; $("timer").classList.remove("late");
    state.timerId = setInterval(function () {
      left -= 1;
      if (left <= 0) { clearInterval(state.timerId); $("timer").textContent = "Короче!"; $("timer").classList.add("late"); return; }
      $("timer").textContent = left;
    }, 1000);
  }
  function chatError(text, retryFn) {
    $("chat-error-text").textContent = text;
    $("chat-error").classList.remove("hidden");
    $("retry").textContent = "Повторить";
    state.retry = retryFn;
  }
  $("retry").onclick = function () { $("chat-error").classList.add("hidden"); if (state.retry) state.retry(); };

  $("answer-form").onsubmit = function (e) {
    e.preventDefault();
    if (state.busy) return;
    var text = $("answer").value.trim();
    if (!text) return;
    clearInterval(state.timerId);
    $("answer").value = "";
    bubble(text, "me");
    state.turns[state.turns.length - 1].a = text;
    sendAnswer();
  };
  $("answer").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("answer-form").requestSubmit(); }
  });

  function sendAnswer() {
    setBusy(true);
    var typing = bubble("печатает…", "bot", "typing");
    api("answer").then(function (d) {
      typing.remove(); setBusy(false);
      if (!d.ok && d.reason === "invalid_answer") {
        bubble(d.message, "bot");
        state.turns[state.turns.length - 1].a = "";
        startTimer();
        return;
      }
      if (!d.ok && d.reason === "support") {
        bubble(d.message, "bot");
        clearInterval(state.timerId);
        $("timer").textContent = "пауза";
        $("answer-form").classList.add("hidden");
        chatError("Тренировка на паузе. Возвращайтесь, когда будете готовы.", function () {
          $("answer-form").classList.remove("hidden");
          $("restart").click();
        });
        $("retry").textContent = "Начать заново";
        return;
      }
      if (!d.ok) return chatError(d.message || "Ошибка.", sendAnswer);
      if (d.reaction) bubble(d.reaction, "bot");
      if (d.done) return getReport();
      ask(d.question, d.n);
    });
  }
  function getReport() {
    setBusy(true);
    $("q-num").textContent = "Инвестор считает баллы…";
    var typing = bubble("считает баллы…", "bot", "typing");
    api("report").then(function (d) {
      typing.remove(); setBusy(false);
      if (!d.ok) return chatError(d.message || "Ошибка.", getReport);
      renderReport(d);
    });
  }

  // ---------- 4. отчёт ----------
  function renderReport(d) {
    $("total").textContent = d.total;
    $("verdict").textContent = d.verdict || "";
    var prev = store("zi_prev_total");
    var parts = [];
    if (typeof d.total_pitch === "number") parts.push("После питча: " + d.total_pitch + " → после ответов: " + d.total);
    if (prev !== null && prev !== "" && store("zi_round") === "2") parts.push("Прошлый раунд: " + prev + " → сейчас: " + d.total);
    $("delta").textContent = parts.join(" · ");
    store("zi_last_total", String(d.total));

    var adv = $("advice"); adv.textContent = "";
    (d.advice || []).forEach(function (a, i) {
      var box = el("div", "advice");
      box.appendChild(el("b", null, (i + 1) + ". " + a.do));
      if (a.how) box.appendChild(el("div", null, a.how));
      var meta = [];
      if (a.result) meta.push("Результат: " + a.result);
      if (a.time) meta.push("Время: " + a.time);
      if (a.criterion) meta.push("Поднимет: " + (CRITERIA[a.criterion - 1] || ""));
      box.appendChild(el("div", "meta", meta.join(" · ")));
      var lab = el("label"); var cb = el("input"); cb.type = "checkbox";
      lab.appendChild(cb); lab.appendChild(document.createTextNode("Сделал"));
      box.appendChild(lab);
      adv.appendChild(box);
    });

    var cr = $("criteria"); cr.textContent = "";
    (d.criteria || []).forEach(function (c) {
      var row = el("div", "crit");
      var head = el("div", "head");
      head.appendChild(el("span", null, c.id + ". " + c.name));
      head.appendChild(el("b", null, c.pitch + " → " + c.final));
      row.appendChild(head);
      var bar = el("div", "bar");
      var p = el("div", "p"); p.style.width = (c.pitch / 3 * 100) + "%";
      var f = el("div", "f"); f.style.width = (c.final / 3 * 100) + "%";
      bar.appendChild(p); bar.appendChild(f); row.appendChild(bar);
      if (c.quote) row.appendChild(el("div", "q", "«" + c.quote + "»"));
      if (c.comment) row.appendChild(el("div", "c", c.comment));
      cr.appendChild(row);
    });
    show("s-report");
  }
  $("round2").onclick = function () {
    store("zi_prev_total", store("zi_last_total") || "");
    store("zi_round", "2");
    $("pitch").value = state.pitch;
    $("pitch-count").textContent = state.pitch.length + " / 5000";
    show("s-pitch");
  };
  $("restart").onclick = function () {
    store("zi_round", "1");
    state.turns = []; state.pitch = ""; $("pitch").value = ""; $("pitch-count").textContent = "0 / 5000";
    show("s-persona");
  };
})();
