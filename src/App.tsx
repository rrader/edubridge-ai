import { useEffect, useMemo, useRef, useState } from "react";
import { topics } from "./curriculum";
import {
  detectComparisonMisconception,
  detectMisconception,
  generateFractionExercise,
  normalize,
  validateFractionAnswer,
  type Fraction,
} from "./learning/fractions";
import { decideMode, type Mode } from "./learning/stateMachine";
import {
  AIProviderRouter,
  BrowserAIProvider,
  CloudAIProvider,
  DeterministicDemoProvider,
} from "./ai";
import {
  db,
  exportData,
  importData,
  readState,
  saveState,
  type Attempt,
  type TeacherRequest,
} from "./storage";

type Page =
  | "home"
  | "curriculum"
  | "lesson"
  | "tutor"
  | "progress"
  | "offline"
  | "teacher"
  | "evaluation"
  | "settings";
type Language = "en" | "uk";
const modeLabel: Record<Mode, string> = {
  independent: "Самостійне навчання",
  adaptive: "Адаптивне навчання",
  teacher: "Потрібна допомога вчителя",
};
const scenarioNames = [
  "Успішне навчання",
  "Адаптивна підказка",
  "Запит учителю",
  "Збій інтернету",
];
const safeFraction = (s: string): Fraction | null => {
  try {
    if (/^\d+\/\d+$/.test(s)) {
      const [n, d] = s.split("/").map(Number);
      return normalize({ n, d });
    }
    if (/^\d+$/.test(s)) return { n: Number(s), d: 1 };
  } catch {}
  return null;
};

export default function App() {
  const [language, setLanguage] = useState<Language>(
    () => (localStorage.getItem("edubridge-language") as Language) || "en",
  );
  const tr = (uk: string, en: string) => language === "en" ? en : uk;
  const [page, setPage] = useState<Page>("home"),
    [topicId, setTopicId] = useState("meaning"),
    [student, setStudent] = useState(""),
    [profileLoaded, setProfileLoaded] = useState(false),
    [nameDraft, setNameDraft] = useState(""),
    [mode, setMode] = useState<Mode>("independent"),
    [teacherLocked, setTeacherLocked] = useState<string[]>([]);
  const [answer, setAnswer] = useState(""),
    [feedback, setFeedback] = useState(""),
    [attempts, setAttempts] = useState(0),
    [mastery, setMastery] = useState<Record<string, number>>({}),
    [history, setHistory] = useState<string[]>([]),
    [requests, setRequests] = useState<TeacherRequest[]>([]),
    [interventionCounts, setInterventionCounts] = useState<
      Record<string, number>
    >({}),
    [interventionLog, setInterventionLog] = useState<Record<string, string[]>>(
      {},
    );
  const [provider, setProvider] = useState<
      "auto" | "cloud" | "browser" | "demo"
    >("browser"),
    [activeProvider, setActiveProvider] = useState("AI у браузері"),
    [cloudUrl, setCloudUrl] = useState(""),
    [cloudModel, setCloudModel] = useState(""),
    [apiKey, setApiKey] = useState(""),
    [notice, setNotice] = useState(""),
    [chat, setChat] = useState<{ role: string; text: string }[]>([]),
    [question, setQuestion] = useState("");
  const [loadingModel, setLoadingModel] = useState(false),
    [progress, setProgress] = useState(0),
    [ready, setReady] = useState(false),
    [appLoaded, setAppLoaded] = useState(false),
    [modelFailure, setModelFailure] = useState(""),
    [scenario, setScenario] = useState<number | null>(null),
    [offline, setOffline] = useState(!navigator.onLine),
    [attemptRecords, setAttemptRecords] = useState<Attempt[]>([]);
  const autoPrepareStarted = useRef(false);
  const successCount = attemptRecords.filter((a) => a.correct).length;
  const topic = topics.find((t) => t.id === topicId)!;
  const exercise =
    mode === "adaptive"
      ? topic.exercises[0]
      : (topicId === "add" || topicId === "subtract") &&
          attempts >= topic.exercises.length
        ? generateFractionExercise(
            attempts - topic.exercises.length,
            topicId === "subtract" ? "subtract" : "add",
          )
        : topic.exercises[attempts % topic.exercises.length];
  const browserAI = useMemo(() => new BrowserAIProvider(), []);
  const router = useMemo(
    () =>
      new AIProviderRouter(
        new CloudAIProvider({ url: cloudUrl, model: cloudModel, apiKey }),
        browserAI,
        new DeterministicDemoProvider(),
      ),
    [cloudUrl, cloudModel, apiKey, browserAI],
  );
  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem("edubridge-language", language);
  }, [language]);
  useEffect(() => {
    (async () => {
      setMastery(await readState("mastery", {}));
      const savedStudent = await readState("student", "");
      setStudent(savedStudent);
      setNameDraft(savedStudent);
      setProfileLoaded(true);
      setMode(await readState("mode", "independent"));
      setTeacherLocked(await readState("teacherLocked", []));
      setInterventionCounts(await readState("interventionCounts", {}));
      setInterventionLog(await readState("interventionLog", {}));
      setHistory(await readState("history", []));
      setCloudUrl(await readState("cloudUrl", ""));
      setCloudModel(await readState("cloudModel", ""));
      const savedProvider = await readState<
        "auto" | "cloud" | "browser" | "demo"
      >("provider", "browser");
      const browserDefaultApplied = await readState(
        "browserDefaultApplied",
        false,
      );
      const selectedProvider =
        savedProvider === "demo" ||
        (!browserDefaultApplied && savedProvider === "auto")
          ? "browser"
          : savedProvider;
      setProvider(selectedProvider);
      await saveState("browserDefaultApplied", true);
      if (selectedProvider !== savedProvider)
        await saveState("provider", selectedProvider);
      setRequests(await db.requests.toArray());
      setAttemptRecords(await db.attempts.toArray());
      setReady(localStorage.getItem("edubridge-model-ready") === "yes");
      setAppLoaded(true);
    })();
    const onOnline = () => {
      setOffline(false);
      setNotice("З’єднання відновлено. Хмарний AI можна використати знову.");
    };
    const onOffline = () => {
      setOffline(true);
      setNotice("Немає інтернету. Навчання і прогрес доступні офлайн.");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);
  useEffect(() => {
    saveState("mastery", mastery);
  }, [mastery]);
  useEffect(() => {
    if (profileLoaded && student.trim()) saveState("student", student.trim());
  }, [student, profileLoaded]);
  useEffect(() => {
    saveState("mode", mode);
  }, [mode]);
  useEffect(() => {
    saveState("teacherLocked", teacherLocked);
  }, [teacherLocked]);
  useEffect(() => {
    saveState("interventionCounts", interventionCounts);
  }, [interventionCounts]);
  useEffect(() => {
    saveState("interventionLog", interventionLog);
  }, [interventionLog]);
  useEffect(() => {
    saveState("history", history);
  }, [history]);
  const goTopic = (id: string) => {
    setTopicId(id);
    setAttempts(0);
    setAnswer("");
    setFeedback("");
    setMode(teacherLocked.includes(id) ? "teacher" : "independent");
    setPage("lesson");
  };
  const submit = async () => {
    if (mode === "teacher" || teacherLocked.includes(topicId)) {
      setFeedback(
        "Тему передано вчителю. Відкрий іншу тему, а цю продовжуй після перегляду запиту.",
      );
      return;
    }
    const expected = safeFraction(exercise.answer);
    let correct: boolean;
    if (topicId === "compare") {
      correct = answer.trim() === exercise.answer;
    } else if (exercise.answer === "так") {
      correct = /^(так|так, рівні|рівні)$/i.test(answer.trim());
    } else correct = !!expected && validateFractionAnswer(answer, expected);
    const parts = Array.from(
      exercise.prompt.matchAll(/(\d+)\s*\/\s*(\d+)/g),
      (m) => ({ n: Number(m[1]), d: Number(m[2]) }),
    );
    const a = parts[0] ?? { n: 1, d: 3 },
      b = parts[1] ?? { n: 1, d: 3 };
    const misconception =
      !correct && topicId === "add"
        ? detectMisconception(answer, a, b, "add")
        : !correct && topicId === "compare"
          ? detectComparisonMisconception(answer, a, b)
          : null;
    const attemptRecord = {
      student,
      topicId,
      answer,
      correct,
      mode,
      provider: activeProvider,
      at: new Date().toISOString(),
      misconception,
    };
    await db.attempts.add(attemptRecord);
    setAttemptRecords((v) => [...v, attemptRecord]);
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    const interventionCount = interventionCounts[topicId] ?? 0;
    const decision = decideMode(mode, {
      correct,
      misconception,
      attempts: nextAttempts,
      interventions: interventionCount,
      topicId,
    });
    if (correct) {
      const n = (mastery[topicId] ?? 0) + 1;
      setInterventionCounts((v) => ({ ...v, [topicId]: 0 }));
      setInterventionLog((v) => ({ ...v, [topicId]: [] }));
      setMastery((v) => ({ ...v, [topicId]: n }));
      setFeedback(
        n >= 2
          ? "Так! Дві правильні відповіді — тему засвоєно. Можеш переходити далі."
          : "Так! Відповідь правильна. Збережено у твоєму поступі.",
      );
      setMode("independent");
      setHistory((v) => [
        ...v,
        `${topic.title}: повернення до самостійного навчання — правильна відповідь.`,
      ]);
    } else {
      setMode(decision.mode);
      setHistory((v) => [
        ...v,
        `${topic.title}: ${modeLabel[decision.mode]} — ${decision.reason}${decision.mode === "adaptive" ? " Показано альтернативне пояснення та простішу вправу." : ""}`,
      ]);
      if (decision.mode === "teacher") {
        const req: TeacherRequest = {
          student,
          topicId,
          reasons: [
            decision.reason,
            misconception ?? "Повторні помилки у вправі",
          ],
          mistakes: [`${exercise.prompt} Відповідь учня: ${answer}`],
          interventions: interventionLog[topicId] ?? [],
          suggested:
            "Перевірити розуміння того, що знаменник описує однакові за розміром частини.",
          status: "open",
          createdAt: new Date().toISOString(),
        };
        const id = await db.requests.add(req);
        setRequests((v) => [...v, { ...req, id }]);
        setTeacherLocked((v) => (v.includes(topicId) ? v : [...v, topicId]));
        setMastery((v) => ({ ...v, [topicId]: 0 }));
        setFeedback(
          "Ця тема потребує погляду вчителя. Запит збережено; інші теми залишаються доступними.",
        );
      } else if (decision.mode === "adaptive") {
        const intervention = alternativeExplanation(topicId);
        const message = misconception
          ? `${misconception} ${intervention}`
          : intervention;
        setInterventionCounts((v) => ({
          ...v,
          [topicId]: interventionCount + 1,
        }));
        setInterventionLog((v) => ({
          ...v,
          [topicId]: [...(v[topicId] ?? []), message],
        }));
        setFeedback(message);
      } else setFeedback("Спробуй ще раз. Натисни «Підказка», якщо треба.");
    }
    setAnswer("");
  };
  const showHint = () =>
    setFeedback(`${exercise.hint} Приклад з теми: ${topic.examples[0]}`);
  const askTutor = async () => {
    if (!question.trim()) return;
    const q = question;
    setQuestion("");
    setChat((v) => [...v, { role: "student", text: q }]);
    const messages = [
      {
        role: "system" as const,
        content: `Ти доброзичливий помічник з математики 6 класу. Відповідай українською коротко, спирайся лише на матеріал. Тема: ${topic.title}. Пояснення: ${topic.explanation}. Приклади: ${topic.examples.join(" | ")}. Спершу став навідне запитання або дай підказку; не оцінюй відповіді замість перевірки програми.`,
      },
      { role: "user" as const, content: q },
    ];
    try {
      const selected =
        scenario === 3 ? (browserAI.isReady ? "browser" : "demo") : provider;
      if (selected === "browser" && ready && !browserAI.isReady) {
        setLoadingModel(true);
        await browserAI.prepare(setProgress);
        setLoadingModel(false);
      }
      const needsSetup = selected === "browser" && !ready;
      const result = await router.ask(
        messages,
        needsSetup ? "demo" : selected,
        () =>
          setNotice(
            "Хмарний AI недоступний: перемикаюся на доступне пояснення.",
          ),
      );
      if (needsSetup)
        setNotice(
          "Браузерний AI ще завантажується. Поки що показую резервне пояснення з уроку.",
        );
      setActiveProvider(
        result.provider === "demo"
          ? "Резервне пояснення з курсу"
          : result.provider === "cloud"
            ? "Хмарний AI"
            : "AI у браузері",
      );
      setChat((v) => [...v, { role: "tutor", text: result.text }]);
    } catch (e) {
      setLoadingModel(false);
      setNotice(
        provider === "browser"
          ? `Не вдалося запустити браузерний AI (${String(e)}). Показую резервне пояснення з уроку.`
          : `AI зараз недоступний: ${String(e)}. Показую резервне пояснення з курсу.`,
      );
      setActiveProvider("Резервне пояснення з курсу");
      setChat((v) => [
        ...v,
        {
          role: "tutor",
          text: `Ось коротке пояснення з уроку: ${topic.explanation}`,
        },
      ]);
    }
  };
  const startScenario = (index: number) => {
    setScenario(index);
    setPage("lesson");
    const targetTopic = index === 1 || index === 2 ? "add" : "meaning";
    setTopicId(targetTopic);
    setAttempts(0);
    setAnswer("");
    setFeedback("");
    setMode(teacherLocked.includes(targetTopic) ? "teacher" : "independent");
    if (!teacherLocked.includes(targetTopic)) {
      setInterventionCounts((v) => ({ ...v, [targetTopic]: 0 }));
      setInterventionLog((v) => ({ ...v, [targetTopic]: [] }));
    }
    if (index === 0) {
      setFeedback("Демонстрація: успішне навчання. Розв’яжи вправу правильно.");
    }
    if (index === 1) {
      setFeedback(
        "Демонстрація: адаптивне навчання. Введи 2/6 для вправи на додавання, щоб побачити типову помилку.",
      );
    }
    if (index === 2) {
      setFeedback(
        "Демонстрація: запит учителю. Після повторних помилок і трьох адаптивних втручань система створить запит учителю.",
      );
    }
    if (index === 3) {
      setOffline(true);
      setNotice(
        "Демонстрація збою з’єднання: офлайн-вправи та локальне збереження продовжують працювати.",
      );
    }
  };
  const prepare = async () => {
    if (!(await browserAI.available())) {
      localStorage.removeItem("edubridge-model-ready");
      setReady(false);
      setModelFailure(
        "Цей браузер не підтримує WebAssembly, потрібний для локального AI.",
      );
      return;
    }
    setLoadingModel(true);
    setNotice("");
    setModelFailure("");
    try {
      if (navigator.storage?.persist) {
        const ok = await navigator.storage.persist();
        setNotice(
          ok
            ? "Браузер надав запитане постійне сховище."
            : "Браузер може очистити сховище для звільнення місця.",
        );
      }
      const estimate = await navigator.storage?.estimate?.();
      if (estimate?.quota && estimate.quota - estimate.usage! < 1_300_000_000) {
        setNotice(
          "Вільного місця може не вистачити. Рекомендовано щонайменше 1,3 ГБ.",
        );
      }
      await browserAI.prepare(setProgress);
      await browserAI.reply([
        { role: "user", content: "Поясни українською, що означає дріб 1/2." },
      ]);
      localStorage.setItem("edubridge-model-ready", "yes");
      setReady(true);
      setNotice("Модель завантажена, запущена й перевірена.");
    } catch (e) {
      localStorage.removeItem("edubridge-model-ready");
      setReady(false);
      setModelFailure(String(e));
    } finally {
      setLoadingModel(false);
    }
  };
  useEffect(() => {
    if (
      !appLoaded ||
      !student.trim() ||
      provider !== "browser" ||
      autoPrepareStarted.current
    )
      return;
    autoPrepareStarted.current = true;
    void prepare();
  }, [appLoaded, student, provider]);
  const downloadExport = async () => {
    const data = await exportData(),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "edubridge-progress.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      await importData(JSON.parse(await file.text()));
      setRequests(await db.requests.toArray());
      setNotice("Резервну копію імпортовано.");
    } catch (e) {
      setNotice(`Не вдалося імпортувати: ${String(e)}`);
    }
  };
  const resolveRequest = async (id: number) => {
    await db.requests.update(id, {
      status: "resolved",
      teacherFeedback: "Опрацьовано вчителем. Учень може повернутися до теми.",
    });
    const resolved = requests.find((r) => r.id === id);
    const remaining = requests.some(
      (r) =>
        r.id !== id && r.topicId === resolved?.topicId && r.status === "open",
    );
    setRequests((v) =>
      v.map((r) => (r.id === id ? { ...r, status: "resolved" } : r)),
    );
    if (resolved && !remaining) {
      setTeacherLocked((v) => v.filter((t) => t !== resolved.topicId));
      setInterventionCounts((v) => ({ ...v, [resolved.topicId]: 0 }));
      setInterventionLog((v) => ({ ...v, [resolved.topicId]: [] }));
      if (topicId === resolved.topicId) setMode("independent");
    }
  };
  const exportCsv = async () => {
    const rows = await db.attempts.toArray();
    const quote = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csv = [
      "record_type,timestamp,student,topic,answer,correct,mode,provider,details",
      ...rows.map((x) =>
        [
          "attempt",
          x.at,
          x.student,
          x.topicId,
          x.answer,
          x.correct,
          x.mode,
          x.provider,
          x.misconception,
        ]
          .map(quote)
          .join(","),
      ),
      ...history.map((x) =>
        [
          "mode_transition",
          new Date().toISOString(),
          student,
          topicId,
          "",
          "",
          "",
          "",
          x,
        ]
          .map(quote)
          .join(","),
      ),
      ...requests.map((x) =>
        [
          "teacher_request",
          x.createdAt,
          x.student,
          x.topicId,
          "",
          "",
          "",
          "",
          `${x.status}: ${x.reasons.join("; ")}; ${x.interventions.join("; ")}`,
        ]
          .map(quote)
          .join(","),
      ),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "edubridge-evaluation.csv";
    a.click();
  };
  const nav: [Page, string, string][] = [
    ["home", "⌂", tr("Огляд", "Overview")],
    ["curriculum", "▦", tr("Програма", "Curriculum")],
    ["progress", "↗", tr("Мій поступ", "My progress")],
    ["teacher", "♧", tr("Для вчителя", "For teachers")],
    ["offline", "◉", tr("Офлайн", "Offline")],
    ["tutor", "✳", tr("AI-тьютор", "AI tutor")],
    ["evaluation", "▤", tr("Оцінювання", "Evaluation")],
    ["settings", "⚙", tr("Налаштування", "Settings")],
  ];
  return (
    <div className="app-shell">
      {loadingModel && (
        <div className="model-startup-screen" role="status" aria-live="polite">
          <div className="model-startup-content">
            <span className="brand-mark">e</span>
            <h1>Запускаю браузерний AI</h1>
            <p>
              Завантажую компактну модель на цей пристрій. Відповіді
              працюватимуть через WebGPU або CPU.
            </p>
            <b>{Math.round(progress * 100)}%</b>
          </div>
          <div
            className="model-startup-track"
            role="progressbar"
            aria-label="Завантаження браузерної моделі"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <i style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}
      {!!modelFailure && !loadingModel && (
        <div
          className="model-startup-screen"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="model-failure-title"
        >
          <div className="model-failure-card">
            <span className="brand-mark">e</span>
            <h1 id="model-failure-title">Браузерний AI недоступний</h1>
            <p>{modelFailure.replace(/^Error:\s*/, "")}</p>
            <small>
              Навчальні матеріали, вправи та поступ працюють без AI.
            </small>
            <button
              className="button-primary"
              onClick={() => setModelFailure("")}
            >
              ОК
            </button>
          </div>
        </div>
      )}
      {!student.trim() && profileLoaded && (
        <div
          className="welcome-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-title"
        >
          <form
            className="welcome-card"
            onSubmit={(event) => {
              event.preventDefault();
              const name = nameDraft.trim();
              if (name) setStudent(name);
            }}
          >
            <span className="brand-mark">e</span>
            <h1 id="welcome-title">Welcome to EduBridge</h1>
            <p>What name should we use for you?</p>
            <label htmlFor="student-name">Your name or nickname</label>
            <input
              id="student-name"
              autoFocus
              maxLength={40}
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              placeholder="For example, Alex"
            />
            <small>This name is saved only on this device.</small>
            <button
              className="button-primary"
              type="submit"
              disabled={!nameDraft.trim()}
            >
              Start learning <b>→</b>
            </button>
          </form>
        </div>
      )}
      <aside className="sidebar">
        <a className="brand" onClick={() => setPage("home")}>
          <span className="brand-mark">e</span>
          <span>
            edubridge<span className="brand-ai">.ai</span>
            <small>LEARN AT YOUR PACE</small>
          </span>
        </a>
        <div className="side-label">{tr("НАВЧАННЯ", "LEARNING")}</div>
        <nav>
          {nav.map(([id, icon, label]) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => setPage(id)}
            >
              <span>{icon}</span>
              {label}
              {id === "teacher" &&
                requests.filter((r) => r.status === "open").length > 0 && (
                  <b className="nav-badge">
                    {requests.filter((r) => r.status === "open").length}
                  </b>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="offline-dot">
            <i /> {offline ? tr("Офлайн режим", "Offline mode") : tr("Навчання доступне", "Learning available")}
          </div>
          <button className="profile" onClick={() => setPage("settings")}>
            <div className="avatar">{student[0]}</div>
            <span>
              <b>{student}</b>
              <small>{tr("Учень · 6 клас", "Student · Grade 6")}</small>
            </span>
            <span className="dots">···</span>
          </button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="crumb">
            {tr("Математика", "Math")} <span>/</span> {tr("Дроби", "Fractions")} <span>/</span>{" "}
            <b>
              {page === "lesson"
                ? topic.title
                : nav.find((n) => n[0] === page)?.[2]}
            </b>
          </div>
          <div className="top-right">
            <div className="language-switch" role="group" aria-label={tr("Мова", "Language")}>
              <button className={language === "en" ? "selected" : ""} aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
              <button className={language === "uk" ? "selected" : ""} aria-pressed={language === "uk"} onClick={() => setLanguage("uk")}>UK</button>
            </div>
            <span className="online-pill">
              <i />
              {offline ? tr("Офлайн", "Offline") : tr("Система активна", "System active")}
            </span>
            <button
              className="icon-btn"
              onClick={() => setPage("offline")}
              aria-label="Офлайн підготовка"
            >
              ◉
            </button>
            <button className="top-avatar" onClick={() => setPage("settings")}>
              {student[0]}
            </button>
          </div>
        </header>
        <div className="content-wrap">
          {notice && (
            <div className="notice">
              <span>ⓘ</span>
              {notice}
              <button onClick={() => setNotice("")}>×</button>
            </div>
          )}
          {page === "home" && (
            <>
              <div className="hero-row">
                <div>
                  <div className="eyebrow">
                    {language === "en" ? "MONDAY, NOVEMBER 16, 2026" : "ПОНЕДІЛОК, 16 ЛИСТОПАДА 2026"}{" "}
                    <span className="spark">✦</span>
                  </div>
                  <h1>
                    {tr(`Привіт, ${student}!`, `Hello, ${student}!`)} <span>✦</span>
                  </h1>
                  <p>{tr("Кожен крок у навчанні має значення. Продовжимо?", "Every step in learning matters. Shall we continue?")}</p>
                </div>
                <button
                  className="button-primary"
                  onClick={() =>
                    goTopic(
                      topics.find((t) => (mastery[t.id] ?? 0) < 2)?.id ??
                        "meaning",
                    )
                  }
                >
                  {tr("Продовжити навчання", "Continue learning")} <b>→</b>
                </button>
              </div>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon lilac">◷</div>
                  <div className="stat-title">ЧАС НАВЧАННЯ</div>
                  <div className="stat-value">
                    {Math.max(12, successCount * 8)} <small>хв</small>
                  </div>
                  <div className="stat-sub">Цього тижня</div>
                  <div className="stat-line">
                    <i style={{ width: "64%" }} />
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon mint">✓</div>
                  <div className="stat-title">ПРАВИЛЬНІ ВІДПОВІДІ</div>
                  <div className="stat-value">
                    {Math.round(
                      (successCount / Math.max(1, attemptRecords.length)) * 100,
                    )}
                    <small>%</small>
                  </div>
                  <div className="stat-sub">Ти прогресуєш!</div>
                  <div className="stat-line mint-line">
                    <i style={{ width: "72%" }} />
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon peach">♧</div>
                  <div className="stat-title">ТЕМИ В РОБОТІ</div>
                  <div className="stat-value">
                    {Object.values(mastery).filter((n) => n > 0).length}
                    <small> / 5</small>
                  </div>
                  <div className="stat-sub">У розділі «Дроби»</div>
                  <div className="stat-line peach-line">
                    <i
                      style={{
                        width: `${Math.max(8, Object.values(mastery).filter((n) => n >= 2).length * 20)}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="stat-card streak">
                  <div className="stat-icon yellow">✧</div>
                  <div className="stat-title">ТВОЯ ЦІЛЬ</div>
                  <div className="stat-value">
                    1 <small>урок</small>
                  </div>
                  <div className="stat-sub">Сьогодні — чудовий день</div>
                  <div className="streak-art">✳</div>
                </div>
              </div>
              <div className="section-head">
                <div>
                  <div className="section-kicker">ТВІЙ МАРШРУТ</div>
                  <h2>{tr("Математика · 6 клас", "Math · Grade 6")}</h2>
                </div>
                <button
                  className="button-light"
                  onClick={() => setPage("curriculum")}
                >
                  Уся програма <span>→</span>
                </button>
              </div>
              <div className="topic-list">
                {topics.map((t, i) => {
                  const done = (mastery[t.id] ?? 0) >= 2;
                  return (
                    <button
                      className="topic-row"
                      key={t.id}
                      onClick={() => goTopic(t.id)}
                    >
                      <span className={`topic-symbol tone-${i}`}>{t.icon}</span>
                      <span className="topic-copy">
                        <b>{t.title}</b>
                        <small>
                          {done
                            ? "Тему засвоєно"
                            : i === 0
                              ? "Почни з основ"
                              : "Наступний крок · " + t.objective}
                        </small>
                      </span>
                      <span className="topic-progress">
                        <i>
                          <b
                            style={{
                              width: `${done ? 100 : mastery[t.id] ? 45 : 0}%`,
                            }}
                          />
                        </i>
                        <small>
                          {done
                            ? "Завершено"
                            : mastery[t.id]
                              ? `${mastery[t.id]}/2 вправ`
                              : "Не розпочато"}
                        </small>
                      </span>
                      <span className="topic-chevron">→</span>
                    </button>
                  );
                })}
              </div>
              <div className="bottom-panels">
                <div className="panel quote-panel">
                  <span className="quote-mark">“</span>
                  <div>
                    <div className="section-kicker">МАЛЕНЬКЕ НАГАДУВАННЯ</div>
                    <p>
                      Не потрібно знати все одразу.
                      <br />
                      <b>Потрібно лише зробити наступний крок.</b>
                    </p>
                  </div>
                  <span className="quote-spark">✳</span>
                </div>
                <div className="panel teacher-mini">
                  <div className="round-icon">♧</div>
                  <div>
                    <div className="section-kicker">НЕ ВСЕ ВИХОДИТЬ?</div>
                    <b>Попросімо вчителя допомогти</b>
                    <small>Вчитель побачить, що саме було складно.</small>
                  </div>
                  <button onClick={() => setPage("teacher")}>→</button>
                </div>
              </div>
              <div className="demo-strip">
                <div>
                  <b>Сценарії для демонстрації</b>
                  <small>Відтворювані приклади, позначені як симуляція</small>
                </div>
                {scenarioNames.map((s, i) => (
                  <button key={s} onClick={() => startScenario(i)}>
                    0{i + 1} · {s}
                  </button>
                ))}
              </div>
            </>
          )}
          {page === "curriculum" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="section-kicker">НАВЧАЛЬНА ПРОГРАМА</div>
                  <h1>{tr("Дроби — крок за кроком", "Fractions, step by step")}</h1>
                  <p>П’ять тем від розуміння частин до обчислень.</p>
                </div>
                <span className="heading-art">½</span>
              </div>
              <div className="curriculum-grid">
                {topics.map((t, i) => (
                  <button
                    key={t.id}
                    className="curriculum-card"
                    onClick={() => goTopic(t.id)}
                  >
                    <span className={`topic-symbol tone-${i}`}>{t.icon}</span>
                    <small>ТЕМА 0{i + 1}</small>
                    <h3>{t.title}</h3>
                    <p>{t.objective}</p>
                    <div className="card-foot">
                      {mastery[t.id] >= 2 ? "Засвоєно ✓" : "Відкрити урок →"}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
          {page === "lesson" && (
            <>
              <div className="lesson-layout">
                <div className="lesson-main">
                  <div className="lesson-top">
                    <button
                      className="back-link"
                      onClick={() => setPage("curriculum")}
                    >
                      ← Програма
                    </button>
                    <span className="topic-count">
                      ТЕМА{" "}
                      {String(
                        topics.findIndex((t) => t.id === topicId) + 1,
                      ).padStart(2, "0")}{" "}
                      / 05
                    </span>
                  </div>
                  <div className="lesson-title">
                    <span
                      className={`topic-symbol tone-${topics.indexOf(topic)}`}
                    >
                      {topic.icon}
                    </span>
                    <div>
                      <h1>{topic.title}</h1>
                      <p>{topic.objective}</p>
                    </div>
                  </div>
                  <div className={`mode-banner mode-${mode}`}>
                    <span>
                      {mode === "independent"
                        ? "◈"
                        : mode === "adaptive"
                          ? "✦"
                          : "♧"}
                    </span>
                    <div>
                      <b>{modeLabel[mode]}</b>
                      <small>
                        {mode === "independent"
                          ? "Рухайся у своєму темпі. Відповіді перевіряє математичне правило."
                          : mode === "adaptive"
                            ? "Спробуємо інше пояснення і простіший крок."
                            : `Запит для вчителя збережено. Можна продовжити інші теми.`}
                      </small>
                    </div>
                    {mode === "teacher" && (
                      <button onClick={() => setPage("teacher")}>
                        Переглянути запит →
                      </button>
                    )}
                  </div>
                  <section className="lesson-card">
                    <div className="section-kicker">РОЗБЕРІМОСЯ</div>
                    <h2>Навчальна ціль</h2>
                    <p>{topic.explanation}</p>
                    <div className="prerequisite">
                      <b>Передумова</b>
                      <span>{topic.prerequisite}</span>
                    </div>
                    <div className="example-box">
                      <b>Приклади</b>
                      {topic.examples.map((e) => (
                        <div key={e}>
                          <span>✦</span>
                          {e}
                        </div>
                      ))}
                    </div>
                    <div className="remember">
                      <b>Зверни увагу</b>
                      <span>{topic.misconception}</span>
                    </div>
                  </section>
                  <section className="exercise-card">
                    <div className="exercise-head">
                      <div>
                        <div className="section-kicker">ТВОЯ ЧЕРГА</div>
                        <h2>Спробуй самостійно</h2>
                      </div>
                      <span className="difficulty">
                        {exercise.level} · Вправа {attempts + 1}
                      </span>
                    </div>
                    <p className="exercise-prompt">{exercise.prompt}</p>
                    <div className="answer-row">
                      <input
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submit()}
                        placeholder="Твоя відповідь…"
                      />
                      <button className="button-primary" onClick={submit}>
                        Перевірити <b>→</b>
                      </button>
                    </div>
                    <div className="exercise-actions">
                      <button onClick={showHint}>✧ Підказка</button>
                      <button onClick={() => setFeedback(topic.explanation)}>
                        ▤ Пояснення теми
                      </button>
                      <span>Перевірка точна, без AI</span>
                    </div>
                    {feedback && (
                      <div
                        className={`answer-feedback ${feedback.startsWith("Так") ? "good" : ""}`}
                      >
                        {feedback}
                      </div>
                    )}
                    {mastery[topicId] >= 2 && (
                      <button
                        className="button-light next-topic"
                        onClick={() =>
                          goTopic(
                            topics[
                              (topics.findIndex((t) => t.id === topicId) + 1) %
                                topics.length
                            ].id,
                          )
                        }
                      >
                        Наступна тема →
                      </button>
                    )}
                  </section>
                </div>
                <aside className="lesson-aside">
                  <div className="aside-card">
                    <div className="section-kicker">ТВІЙ МАРШРУТ</div>
                    <h3>Дроби</h3>
                    <div className="vertical-steps">
                      {topics.map((t, i) => (
                        <button
                          key={t.id}
                          className={topicId === t.id ? "current" : ""}
                          onClick={() => goTopic(t.id)}
                        >
                          <i>
                            {mastery[t.id] >= 2
                              ? "✓"
                              : String(i + 1).padStart(2, "0")}
                          </i>
                          <span>
                            <b>{t.title}</b>
                            <small>
                              {mastery[t.id] >= 2
                                ? "Засвоєно"
                                : topicId === t.id
                                  ? "Ти тут"
                                  : "Попереду"}
                            </small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="aside-card ai-mini">
                    <div className="ai-orb">✳</div>
                    <div className="section-kicker">ПОТРІБНЕ ПОЯСНЕННЯ?</div>
                    <p>Постав запитання тьютору про цю тему.</p>
                    <button
                      className="button-light"
                      onClick={() => {
                        setPage("tutor");
                        setChat([]);
                      }}
                    >
                      Запитати тьютора →
                    </button>
                    <small>Зараз: {activeProvider}</small>
                  </div>
                  <div className="aside-card provider-mini">
                    <i className="green-dot" />
                    <span>
                      <b>
                        {offline
                          ? "Працюємо офлайн"
                          : "Урок збережеться локально"}
                      </b>
                      <small>Поточний помічник</small>
                    </span>
                    <button onClick={() => setPage("settings")}>···</button>
                  </div>
                </aside>
              </div>
            </>
          )}
          {page === "tutor" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="section-kicker">ТВОЯ НАВЧАЛЬНА ПІДТРИМКА</div>
                  <h1>
                    Запитай тьютора <span className="purple">✳</span>
                  </h1>
                  <p>
                    Навідні запитання та короткі пояснення саме до твоєї теми.
                  </p>
                </div>
              </div>
              <div className="tutor-box">
                <div className="tutor-context">
                  <span className="ai-orb">✳</span>
                  <div>
                    <b>Помічник з математики · 6 клас</b>
                    <small>
                      Тема: {topic.title} · джерело: {activeProvider}
                    </small>
                  </div>
                  <div className="provider-select">
                    <select
                      value={provider}
                      onChange={(e) => {
                        const selected = e.target.value as
                          "auto" | "cloud" | "browser" | "demo";
                        setProvider(selected);
                        saveState("provider", selected);
                      }}
                    >
                      <option value="auto">Автоматично</option>
                      <option value="cloud">Хмарний AI</option>
                      <option value="browser">AI у браузері</option>
                    </select>
                    <small className="provider-help">
                      Браузерний AI генерує відповіді на цьому пристрої після
                      завантаження моделі. Якщо він недоступний, чат покаже
                      резервне пояснення з уроку.
                    </small>
                  </div>
                </div>
                {provider === "browser" && !ready && (
                  <div className="model-setup-prompt">
                    <div>
                      <b>Потрібно підготувати браузерний AI</b>
                      <p>
                        Модель завантажується один раз (близько 550 МБ). Якщо
                        WebGPU не підтримує модель, вона працюватиме на CPU
                        повільніше.
                      </p>
                    </div>
                    <button
                      className="button-light"
                      onClick={() => setPage("offline")}
                    >
                      Підготувати AI →
                    </button>
                  </div>
                )}
                <div className="chat-log">
                  {chat.length === 0 ? (
                    <div className="chat-welcome">
                      <span>✳</span>
                      <h2>Привіт, {student}!</h2>
                      <p>
                        Я допоможу розібратися з дробами. Можу пояснити крок,
                        дати натяк або поставити запитання, яке підкаже шлях.
                      </p>
                      <div>
                        {[
                          "Поясни тему простіше",
                          "Дай підказку до вправи",
                          "Чому знаменники не додаються?",
                        ].map((x) => (
                          <button key={x} onClick={() => setQuestion(x)}>
                            {x} ↗
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    chat.map((c, i) => (
                      <div className={`chat-message ${c.role}`} key={i}>
                        <small>
                          {c.role === "student"
                            ? student
                            : "Тьютор · " + activeProvider}
                        </small>
                        <p>{c.text}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="chat-input">
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && askTutor()}
                    placeholder="Напиши своє запитання…"
                  />
                  <button className="button-primary" onClick={askTutor}>
                    Надіслати ↑
                  </button>
                </div>
                <div className="privacy-note">
                  ⓘ Якщо обрано хмарний AI, текст запитання надійде
                  налаштованому зовнішньому сервісу. Історія учня автоматично не
                  надсилається.
                </div>
              </div>
            </>
          )}
          {page === "progress" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="section-kicker">ТВОЯ ІСТОРІЯ</div>
                  <h1>{tr(`Твій поступ, ${student}`, `${student}'s progress`)}</h1>
                  <p>Ти вчишся у своєму темпі — ось що вже вдалося.</p>
                </div>
                <button className="button-light" onClick={downloadExport}>
                  ↓ Експортувати дані
                </button>
              </div>
              <div className="progress-overview">
                <div className="progress-score">
                  <span>ЗАСВОЄНО ТЕМ</span>
                  <b>
                    {Object.values(mastery).filter((n) => n >= 2).length}
                    <small>/5</small>
                  </b>
                  <i>
                    {topics.map((t) => (
                      <em
                        key={t.id}
                        style={{ opacity: mastery[t.id] >= 2 ? 1 : 0.17 }}
                      />
                    ))}
                  </i>
                </div>
                <div className="progress-detail">
                  <div>
                    <span>Вправ пройдено</span>
                    <b>{attemptRecords.length}</b>
                  </div>
                  <div>
                    <span>Правильних відповідей</span>
                    <b>{successCount}</b>
                  </div>
                  <div>
                    <span>Поточний режим</span>
                    <b>{modeLabel[mode]}</b>
                  </div>
                  <div>
                    <span>Режим збереження</span>
                    <b>Локально на пристрої</b>
                  </div>
                </div>
              </div>
              <div className="section-head">
                <div>
                  <div className="section-kicker">ІСТОРІЯ РІШЕНЬ</div>
                  <h2>Як змінювався маршрут</h2>
                </div>
              </div>
              <div className="history-list">
                {history.length ? (
                  history
                    .slice()
                    .reverse()
                    .map((h, i) => (
                      <div key={i}>
                        <i className="timeline-dot" />
                        <span>{h}</span>
                        <small>Зафіксовано</small>
                      </div>
                    ))
                ) : (
                  <div className="empty-state">
                    Після першої вправи тут з’явиться твій навчальний маршрут.
                  </div>
                )}
              </div>
            </>
          )}
          {page === "teacher" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="section-kicker">ПАНЕЛЬ НАСТАВНИКА</div>
                  <h1>Навчання поруч</h1>
                  <p>
                    Дані збережено лише на цьому пристрої. Запити не передаються
                    між пристроями автоматично.
                  </p>
                </div>
                <span className="teacher-avatar">♧</span>
              </div>
              <div className="teacher-stats">
                <div>
                  <small>УЧНІВ НА ЦЬОМУ ПРИСТРОЇ</small>
                  <b>
                    {new Set([student, ...requests.map((r) => r.student)]).size}
                  </b>
                </div>
                <div>
                  <small>ЗАПИТИ ДО ВЧИТЕЛЯ</small>
                  <b>{requests.filter((r) => r.status === "open").length}</b>
                </div>
                <div>
                  <small>АДАПТИВНІ ПЕРЕХОДИ</small>
                  <b>{history.filter((h) => h.includes("Адаптивне")).length}</b>
                </div>
              </div>
              <div className="section-head">
                <div>
                  <div className="section-kicker">ПОТРЕБУЮТЬ УВАГИ</div>
                  <h2>Запити вчителю</h2>
                </div>
              </div>
              {requests.length === 0 ? (
                <div className="empty-state panel">
                  Поки немає запитів. Якщо учню не вдасться розібратися після
                  адаптивних підказок, система збере докази тут.
                </div>
              ) : (
                requests
                  .slice()
                  .reverse()
                  .map((r) => (
                    <div className="request-card" key={r.id}>
                      <div className="request-top">
                        <div className="avatar">{r.student[0]}</div>
                        <div>
                          <b>
                            {r.student} ·{" "}
                            {topics.find((t) => t.id === r.topicId)?.title}
                          </b>
                          <small>
                            {new Date(r.createdAt).toLocaleString("uk-UA")}
                          </small>
                        </div>
                        <span className={`request-status ${r.status}`}>
                          {r.status === "open"
                            ? "Потребує уваги"
                            : "Опрацьовано"}
                        </span>
                      </div>
                      <div className="request-columns">
                        <div>
                          <b>Чому передано</b>
                          {r.reasons.map((x) => (
                            <p key={x}>• {x}</p>
                          ))}
                        </div>
                        <div>
                          <b>Що пробували</b>
                          {r.interventions.map((x) => (
                            <p key={x}>• {x}</p>
                          ))}
                        </div>
                        <div>
                          <b>Рекомендація</b>
                          <p>{r.suggested}</p>
                          <b>Помилка у вправі</b>
                          <p>{r.mistakes.join("; ")}</p>
                        </div>
                      </div>
                      {r.teacherFeedback && (
                        <p className="teacher-feedback">
                          <b>Відгук учителя:</b> {r.teacherFeedback}
                        </p>
                      )}
                      {r.status === "open" && (
                        <button
                          className="button-primary"
                          onClick={() => resolveRequest(r.id!)}
                        >
                          Позначити опрацьованим ✓
                        </button>
                      )}
                    </div>
                  ))
              )}
            </>
          )}
          {page === "offline" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="section-kicker">OFFLINE-FIRST · PWA</div>
                  <h1>Підготувати до роботи без інтернету</h1>
                  <p>
                    Навчальний курс, вправи й прогрес працюють офлайн. Модель
                    завантажується лише на твій запит.
                  </p>
                </div>
                <span className="heading-art">◉</span>
              </div>
              <div className="offline-hero panel">
                <div className="offline-illustration">
                  ◌<span>✳</span>
                </div>
                <div>
                  <div className="section-kicker">
                    ГОТОВНІСТЬ ДО ОФЛАЙН РОБОТИ
                  </div>
                  <h2>{ready ? "Модель підготовлена" : "Почни з основ"}</h2>
                  <p>
                    Уроки та прогрес уже зберігаються на пристрої. AI обирає
                    GPU-рушій, сумісний із пристроєм, і переходить на CPU лише
                    якщо GPU не запускається.
                  </p>
                  <div className="readiness">
                    <div>
                      <i className="green-dot" />
                      Курс і вправи<small>Завжди доступні</small>
                    </div>
                    <div>
                      <i className={ready ? "green-dot" : "gray-dot"} />
                      {ready ? "Модель збережена" : "Локальна модель"}
                      <small>Qwen2.5-0.5B · WebGPU / WebAssembly</small>
                    </div>
                    <div>
                      <i className="green-dot" />
                      Прогрес та запити<small>IndexedDB · цей пристрій</small>
                    </div>
                  </div>
                  {loadingModel ? (
                    <>
                      <div className="progress-track">
                        <i style={{ width: `${progress * 100}%` }} />
                      </div>
                      <p>
                        Завантаження і підготовка моделі ·{" "}
                        {Math.round(progress * 100)}%
                      </p>
                    </>
                  ) : (
                    <button className="button-primary" onClick={prepare}>
                      {ready
                        ? "Перевірити модель знову"
                        : "Завантажити офлайн-модель"}{" "}
                      <b>↓</b>
                    </button>
                  )}
                  <small className="offline-size">
                    Очікуване завантаження близько 550 МБ; під час роботи
                    потрібно додаткове місце для запуску. Якщо GPU-рушій
                    пристрою несумісний, AI автоматично переходить на CPU
                    повільніше.
                  </small>
                </div>
              </div>
              <div className="offline-grid">
                <div className="panel">
                  <div className="section-kicker">ПЕРЕВІРКА ПРИСТРОЮ</div>
                  <div className="check-row">
                    <span>Підтримка WebGPU</span>
                    <b>{(navigator as any).gpu ? "Доступна" : "Не виявлено"}</b>
                  </div>
                  <div className="check-row">
                    <span>Сховище браузера</span>
                    <b>{navigator.storage ? "Доступне" : "Обмежене"}</b>
                  </div>
                  <div className="check-row">
                    <span>Завантаження моделі</span>
                    <b>{ready ? "Завершено" : "Потрібна дія"}</b>
                  </div>
                  <div className="check-row">
                    <span>Навчання без моделі</span>
                    <b className="good-text">Доступне</b>
                  </div>
                </div>
                <div className="panel">
                  <div className="section-kicker">ПЕРЕВІРКА ОФЛАЙНУ</div>
                  <h3>Переконайся, що уроки доступні</h3>
                  <p>
                    Після завантаження застосунку відкрий урок і перевір вправу.
                    Самостійно вимкни інтернет у браузері чи на пристрої — цей
                    тест не підміняє справжню перевірку середовища.
                  </p>
                  <button
                    className="button-light"
                    onClick={() => {
                      setPage("lesson");
                      setTopicId("meaning");
                      setNotice(
                        "Перейшли до локального уроку. Для фактичного тесту вимкни мережу у пристрої.",
                      );
                    }}
                  >
                    Відкрити офлайн-урок →
                  </button>
                </div>
              </div>
            </>
          )}
          {page === "evaluation" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="section-kicker">
                    WAICY · ВІДТВОРЮВАНЕ ОЦІНЮВАННЯ
                  </div>
                  <h1>Як працює EduBridge</h1>
                  <p>
                    Показники збираються з реальних локальних спроб. Результати
                    не вигадуються.
                  </p>
                </div>
                <button className="button-light" onClick={exportCsv}>
                  ↓ Експорт CSV
                </button>
              </div>
              <div className="eval-grid">
                <div className="panel">
                  <div className="section-kicker">ФАКТИЧНІ ЛОКАЛЬНІ ДАНІ</div>
                  <div className="eval-metrics">
                    <div>
                      <b>{attemptRecords.length}</b>
                      <small>збережених спроб</small>
                    </div>
                    <div>
                      <b>{activeProvider}</b>
                      <small>поточне джерело</small>
                    </div>
                    <div>
                      <b>{ready ? "Готова" : "Не підготовлена"}</b>
                      <small>offline-ready стан</small>
                    </div>
                  </div>
                  <p>
                    Демонстраційні сценарії не додаються до експериментальних
                    вимірювань як справжня продуктивність.
                  </p>
                </div>
                <div className="panel">
                  <div className="section-kicker">ПОРІВНЯННЯ ПІДХОДІВ</div>
                  <div className="compare-row">
                    <b>Cloud AI</b>
                    <span>
                      Гнучкі пояснення · потрібна мережа та власний API
                    </span>
                  </div>
                  <div className="compare-row">
                    <b>Browser AI</b>
                    <span>
                      Локальний інференс · WebGPU і велике завантаження
                    </span>
                  </div>
                  <div className="compare-row">
                    <b>Перевірений курс</b>
                    <span>
                      Детерміновані вправи · доступний офлайн без моделі
                    </span>
                  </div>
                </div>
                <div className="panel rubric">
                  <div className="section-kicker">
                    ЛЮДСЬКА ОЦІНКА ЯКОСТІ ПОЯСНЕНЬ
                  </div>
                  <h3>Рубрика для учнів і вчителів</h3>
                  <p>
                    Оціни відповідність математиці, зрозумілість українською,
                    навідність підказки, вікову доречність і чесне визнання
                    невизначеності (1–4 бали). Автоматична перевірка не доводить
                    педагогічну ефективність.
                  </p>
                </div>
              </div>
              <div className="section-head">
                <div>
                  <div className="section-kicker">20 КОНТРОЛЬНИХ ЗАПИТАНЬ</div>
                  <h2>Набір для ручного порівняння</h2>
                </div>
              </div>
              <div className="question-set">
                {evaluationQuestions.map((q, i) => (
                  <div key={q}>
                    <i>{String(i + 1).padStart(2, "0")}</i>
                    {q}
                  </div>
                ))}
              </div>
            </>
          )}
          {page === "settings" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="section-kicker">ТВОЇ ПАРАМЕТРИ</div>
                  <h1>{tr("Налаштування", "Settings")}</h1>
                  <p>{tr("Псевдонім і підключення зберігаються на цьому пристрої.", "Your nickname and connection settings are saved on this device.")}</p>
                </div>
              </div>
              <div className="settings-grid">
                <section className="panel">
                  <div className="section-kicker">{tr("ПРОФІЛЬ УЧНЯ", "STUDENT PROFILE")}</div>
                  <label>
                    {tr("Псевдонім", "Nickname")}
                    <input
                      value={student}
                      onChange={(e) => setStudent(e.target.value || "Учень")}
                    />
                  </label>
                  <p className="privacy-note">
                    Не вводь повне ім’я, адресу чи інші персональні дані.
                  </p>
                </section>
                <section className="panel">
                  <div className="section-kicker">AI-ПРОВАЙДЕР</div>
                  <label>
                    Режим
                    <select
                      value={provider}
                      onChange={(e) => {
                        const x = e.target.value as any;
                        setProvider(x);
                        saveState("provider", x);
                      }}
                    >
                      <option value="auto">
                        Автоматично: Cloud → Browser AI
                      </option>
                      <option value="cloud">Хмарний AI</option>
                      <option value="browser">AI у браузері</option>
                    </select>
                  </label>
                  <label>
                    OpenAI-сумісний endpoint
                    <input
                      placeholder="https://…/v1/chat/completions"
                      value={cloudUrl}
                      onChange={(e) => setCloudUrl(e.target.value)}
                    />
                  </label>
                  <label>
                    Назва моделі
                    <input
                      placeholder="Модель твого провайдера"
                      value={cloudModel}
                      onChange={(e) => setCloudModel(e.target.value)}
                    />
                  </label>
                  <label>
                    API key{" "}
                    <input
                      type="password"
                      placeholder="Не зберігається у спільному коді"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </label>
                  <p className="privacy-note">
                    У локальному MVP ключ залишається у вкладці браузера і не
                    записується в IndexedDB. Для спільного розгортання потрібен
                    власний захищений proxy; ключ у браузері не є
                    production-секретом.
                  </p>
                  <button
                    className="button-primary"
                    onClick={async () => {
                      await saveState("cloudUrl", cloudUrl);
                      await saveState("cloudModel", cloudModel);
                      await saveState("provider", provider);
                      setNotice("Налаштування збережено на цьому пристрої.");
                    }}
                  >
                    Зберегти параметри ✓
                  </button>
                </section>
                <section className="panel">
                  <div className="section-kicker">РЕЗЕРВНА КОПІЯ</div>
                  <p>
                    Перенеси прогрес між пристроями JSON-файлом. Реальної
                    синхронізації між пристроями немає.
                  </p>
                  <div className="button-pair">
                    <button className="button-light" onClick={downloadExport}>
                      ↓ Експорт JSON
                    </button>
                    <label className="file-button">
                      ↑ Імпорт JSON
                      <input
                        type="file"
                        accept="application/json"
                        onChange={(e) => importFile(e.target.files?.[0])}
                      />
                    </label>
                  </div>
                </section>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
function alternativeExplanation(topicId: string) {
  const explanations: Record<string, string> = {
    meaning:
      "Уяви плитку шоколаду: спочатку порахуй усі однакові шматочки, а тоді — скільки з них узяли. Перша кількість унизу дробу, друга — вгорі.",
    equivalent:
      "Уяви, що кожну частинку половини поділили ще навпіл. Частинок стало більше, але ми все ще маємо ту саму половину.",
    compare:
      "Порівняй не числа внизу, а розмір частинок або зведи дроби до однакового знаменника.",
    add: "Уяви дві третини піци: це дві частинки з тих самих трьох. Ми додаємо кількість частинок, а їхній розмір — третина — не змінюється.",
    subtract:
      "Щоб забрати частини, спершу зроби їх однакового розміру: перетвори дроби до спільного знаменника.",
  };
  return `${explanations[topicId] ?? "Розглянь цілe як набір однакових частин і виконай один крок за раз."} Спробуй ще раз на простому прикладі.`;
}
const evaluationQuestions = [
  "Що показує знаменник дробу 3/7?",
  "Яку частину становлять 2 із 5 рівних частин?",
  "Поясни, чому 1/2 = 2/4.",
  "Скороти дріб 8/12.",
  "Порівняй 4/9 і 7/9.",
  "Що більше: 3/5 чи 3/8?",
  "Поясни порівняння дробів зі спільним знаменником.",
  "Обчисли 2/11 + 5/11.",
  "Чому в 1/4 + 1/4 знаменник не стає 8?",
  "Обчисли 1/2 + 1/3.",
  "Знайди спільний знаменник для 2/3 і 1/4.",
  "Обчисли 7/8 − 3/8.",
  "Обчисли 3/4 − 1/2.",
  "Як перевірити рівність 2/3 і 8/12?",
  "Учень додав знаменники. Як м’яко пояснити помилку?",
  "Поясни дріб через приклад із піцою.",
  "Дай навідну підказку до 2/5 + 1/10, не розв’язуючи повністю.",
  "Що робити, якщо учень плутає чисельник і знаменник?",
  "Коли слід покликати вчителя?",
  "Як продовжити роботу офлайн без локальної мовної моделі?",
];
