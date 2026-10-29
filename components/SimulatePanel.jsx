"use client";
// Simulate: a MiroFish-style market simulation run by Inovo.
// Compare ranks every Inovix product; Simulate one runs brief → personas → 2 rounds → report.
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

const DECISIONS = [
  ["buy", "Buy"],
  ["pilot", "Pilot"],
  ["maybe", "Maybe"],
  ["no", "No"],
];
const STEPS = ["Seed brief", "Personas", "Round 1", "Round 2", "Report"];
const STORE = "inoverse-sim";

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "{}");
  } catch {
    return {};
  }
};
const save = (patch) => {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...load(), ...patch }));
  } catch {}
};

export default function SimulatePanel({ lang, onSpeak }) {
  const [view, setView] = useState("compare");
  const [meta, setMeta] = useState({ products: [], scenarios: [] });
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/simulate")
      .then(setMeta)
      .catch((e) => setError(e.message));
    const saved = load();
    if (saved.view) setView(saved.view);
  }, []);

  const pick = (v) => {
    setView(v);
    save({ view: v });
  };

  return (
    <div className="stack sim">
      <p className="lead">
        Inovo creates realistic Pakistani customers from each product's brief, lets them react and talk to each other, then
        reports. Modelled on MiroFish.
      </p>

      <div className="seg" role="tablist" aria-label="Simulation views">
        <button role="tab" aria-selected={view === "compare"} onClick={() => pick("compare")}>Compare products</button>
        <button role="tab" aria-selected={view === "single"} onClick={() => pick("single")}>Simulate one</button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {view === "compare" ? (
        <Compare lang={lang} onSpeak={onSpeak} products={meta.products} onOpen={(p) => { pick("single"); save({ product: p }); }} />
      ) : (
        <Single lang={lang} onSpeak={onSpeak} meta={meta} />
      )}

      <p className="muted sim-note">
        These are AI-made customers, not real ones. Use the result to choose what to test with real people this week, not as
        proof that people will pay.
      </p>
    </div>
  );
}

// ---------- compare every product ----------
function Compare({ lang, onSpeak, products, onOpen }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  const [progress, setProgress] = useState({}); // product → running | done | failed

  useEffect(() => {
    const saved = load().compare;
    if (saved?.ranking) setData(saved);
  }, []);

  async function run(fresh) {
    setBusy(true);
    setError("");
    const names = products.map((p) => p.name);
    setProgress(Object.fromEntries(names.map((n) => [n, "running"])));
    const call = (body) => api("/api/simulate", { method: "POST", body });
    // a slow or dropped AI answer gets one more try, so no product silently drops out
    const retry = (body) => call(body).catch(() => call(body));
    try {
      // every product in parallel (separate requests), plus the first-sale judge
      const [ease, ...settled] = await Promise.allSettled([
        retry({ step: "ease", fresh }),
        ...names.map((product) =>
          retry({ step: "quick", product, fresh }).then(
            (r) => (setProgress((p) => ({ ...p, [product]: "done" })), r),
            (e) => {
              setProgress((p) => ({ ...p, [product]: "failed" }));
              throw e;
            }
          )
        ),
      ]);
      const results = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
      if (!results.length) throw settled[0]?.reason || new Error("The simulation failed. Try again.");
      const d = await retry({ step: "rank", lang, results, ease: ease.status === "fulfilled" ? ease.value.ease : {} });
      d.failed = names.filter((_, i) => settled[i].status === "rejected");
      setData(d);
      save({ compare: d });
      if (d.say) onSpeak?.(d.say);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const best = data?.ranking?.[0];
  return (
    <>
      <div className="row">
        {/* after a partial run, reuse the products that worked and redo only the missing ones */}
        <button className="btn" onClick={() => run(Boolean(data) && !data.failed?.length)} disabled={busy || !products.length}>
          {busy ? "Simulating…" : !products.length ? "Loading products…" : data ? "Run again" : "Find our best product"}
        </button>
        {data?.at && !busy && (
          <span className="muted">
            Last run {new Date(data.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {busy && (
        <div className="card sim-running" aria-live="polite">
          <p className="item-title">8 customers are meeting each product…</p>
          <ul className="sim-chips">
            {products.map((p) => (
              <li key={p.name} className={`st-${progress[p.name] || "running"}`}>
                <span className="sim-pulse" aria-hidden="true" />
                {p.name}
                <span className="sr-only">: {progress[p.name] || "running"}</span>
              </li>
            ))}
          </ul>
          <p className="muted">About 30 to 60 seconds.</p>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      {!data && !busy && (
        <div className="card">
          <p className="item-title">Which product should Inovix focus on?</p>
          <p className="muted">
            Each product meets 8 simulated customers. The score is 50% their demand, 30% how fast a small team can land the
            first paying customer, and 20% how ready the product is.
          </p>
        </div>
      )}

      {best && !busy && (
        <>
          {data.failed?.length > 0 && (
            <p className="error" role="alert">
              {data.failed.join(", ")} couldn't be simulated (the AI didn't answer in time), so {data.failed.length === 1 ? "it isn't" : "they aren't"} in this
              ranking. Press Run again before trusting the winner.
            </p>
          )}
          <div className="gap go sim-best">
            <p className="sim-eyebrow">Best product to focus on</p>
            <div className="verdict">
              <strong>{best.product}</strong>
              <span>{best.score} out of 10</span>
            </div>
            {data.why_best && <p>{data.why_best}</p>}
            {data.fastest_cash && <p className="muted"><b>Fastest cash:</b> {data.fastest_cash}</p>}
            {data.this_week && <p className="muted"><b>This week:</b> {data.this_week}</p>}
            {data.say && (
              <button className="link" onClick={() => onSpeak?.(data.say)}>Hear Inovo's take</button>
            )}
          </div>

          <ol className="list sim-rank">
            {data.ranking.map((r, i) => (
              <li key={r.product} className="card">
                <div className="item-head">
                  <p className="item-title">
                    <span className="sim-pos">{i + 1}</span> {r.product}
                  </p>
                  <span className={`ov-tag sim-v-${r.verdict.split(" ")[0].toLowerCase()}`}>{r.verdict}</span>
                </div>
                <dl className="scores">
                  <Bar label="Overall" value={r.score} strong />
                  <Bar label="Demand" value={r.pull} />
                  <Bar label="First sale" value={r.ease} />
                  <Bar label="Readiness" value={r.readiness} />
                </dl>
                <Decisions counts={r.counts} />
                {r.best_segment && <p className="muted"><b>Best first customers:</b> {r.best_segment}</p>}
                {r.biggest_risk && <p className="muted"><b>Biggest risk:</b> {r.biggest_risk}</p>}
                <div className="row">
                  <button className="link" onClick={() => setOpen(open === r.product ? null : r.product)} aria-expanded={open === r.product}>
                    {open === r.product ? "Hide customers" : "What customers said"}
                  </button>
                  <button className="link" onClick={() => onOpen(r.product)}>Full simulation</button>
                </div>
                {open === r.product && (
                  <ul className="sim-quotes">
                    {r.personas.map((p, k) => (
                      <li key={k}>
                        <span className={`sim-d d-${p.decision}`}>{p.decision}</span>
                        <b>{p.name}</b> <span className="muted">{p.segment}</span>
                        <q>{p.says}</q>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}

// ---------- one product, full run ----------
function Single({ lang, onSpeak, meta }) {
  const [product, setProduct] = useState("");
  const [scenario, setScenario] = useState("launch");
  const [question, setQuestion] = useState("");
  const [brief, setBrief] = useState("");
  const [step, setStep] = useState(-1); // index into STEPS while running; 5 = done
  const [personas, setPersonas] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [report, setReport] = useState(null);
  const [failedAt, setFailedAt] = useState(-1); // the step that failed, so it can be resumed
  const [error, setError] = useState("");
  const runId = useRef(0);

  // the seed brief is fetched when the product changes; this remembers which one is loaded
  const briefFor = useRef("");

  // restore the last run (if it's for the chosen product), or start with the chosen/first product
  useEffect(() => {
    const s = load();
    if (s.single?.report && (!s.product || s.product === s.single.product)) {
      briefFor.current = s.single.product;
      setProduct(s.single.product);
      setScenario(s.single.scenario);
      setQuestion(s.single.question || "");
      setBrief(s.single.brief);
      setPersonas(s.single.personas);
      setRounds(s.single.rounds);
      setReport(s.single.report);
      setStep(5);
    } else if (s.product) setProduct(s.product);
  }, []);
  useEffect(() => {
    if (!product && meta.products[0]) setProduct(meta.products[0].name);
  }, [meta.products, product]);

  useEffect(() => {
    if (!product || briefFor.current === product) return;
    briefFor.current = product;
    // a different product: clear the old run
    setPersonas([]);
    setRounds([]);
    setReport(null);
    setStep(-1);
    setFailedAt(-1);
    setError("");
    api("/api/simulate", { method: "POST", body: { step: "brief", product } })
      .then((d) => setBrief(d.brief))
      .catch((e) => setError(e.message));
  }, [product]);

  const running = step >= 0 && step < 5 && failedAt < 0;

  // resume: after a failed step, keep what already finished and continue from there
  async function run(resume = false) {
    const id = ++runId.current;
    const base = { brief, scenario, question };
    const call = (body) => api("/api/simulate", { method: "POST", body: { ...base, ...body } });
    const alive = () => runId.current === id;
    let ps = resume ? personas : [];
    let rs = resume ? rounds : [];
    setError("");
    setFailedAt(-1);
    setReport(null);
    if (!resume) {
      setPersonas([]);
      setRounds([]);
    }
    let at = 1;
    try {
      if (!ps.length) {
        setStep((at = 1));
        ps = (await call({ step: "personas" })).personas;
        if (!alive()) return;
        setPersonas(ps);
      }
      if (rs.length < 1) {
        setStep((at = 2));
        rs = [(await call({ step: "round", round: 1, personas: ps })).reactions];
        if (!alive()) return;
        setRounds(rs);
      }
      if (rs.length < 2) {
        setStep((at = 3));
        rs = [rs[0], (await call({ step: "round", round: 2, personas: ps, previous: rs[0] })).reactions];
        if (!alive()) return;
        setRounds(rs);
      }
      setStep((at = 4));
      const { report: rep } = await call({ step: "report", product, personas: ps, rounds: rs, lang });
      if (!alive()) return;
      setReport(rep);
      setStep(5);
      save({ single: { product, scenario, question, brief, personas: ps, rounds: rs, report: rep } });
      if (rep.say) onSpeak?.(rep.say);
    } catch (e) {
      if (!alive()) return;
      setError(e.message);
      setFailedAt(at);
      setStep(at);
    }
  }

  const sc = meta.scenarios.find((s) => s.key === scenario);
  const last = rounds.at(-1) || [];
  const first = rounds[0] || [];

  return (
    <>
      <div className="card form">
        <div className="row">
          <label>
            Product
            <select value={product} onChange={(e) => { setProduct(e.target.value); save({ product: e.target.value }); }} disabled={running}>
              {meta.products.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="chips" role="group" aria-label="Scenario">
          {meta.scenarios.map((s) => (
            <button key={s.key} aria-pressed={scenario === s.key} onClick={() => setScenario(s.key)} disabled={running}>
              {s.label}
            </button>
          ))}
        </div>
        {sc && <p className="muted">{sc.ask}</p>}
        <label>
          Your question (optional)
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={running}
            placeholder={scenario === "pricing" ? "PKR 8,000 → 10,000 a month?" : scenario === "positioning" ? "“Save 20% on your bill” vs “Never cross the slab”" : "Will they pay before they see results?"}
          />
        </label>
        <details className="sim-brief">
          <summary>Seed brief: what the customers are told (edit before running)</summary>
          <textarea rows={9} value={brief} onChange={(e) => setBrief(e.target.value)} disabled={running} aria-label="Seed brief" />
          <p className="muted">Change data/product-briefs.md to keep edits. Evidence you log for this product is added automatically.</p>
        </details>
        <button className="btn" onClick={() => run(false)} disabled={running || brief.trim().length < 20}>
          {running ? "Simulating…" : report ? "Run again" : "Run simulation"}
        </button>
      </div>

      {step >= 0 && (
        <ol className="sim-steps" aria-label="Simulation progress">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step || step === 5 ? "done" : i === failedAt ? "failed" : i === step ? "active" : ""} aria-current={i === step ? "step" : undefined}>
              <span className="sim-node" aria-hidden="true" />
              {s}
            </li>
          ))}
        </ol>
      )}
      {error && (
        <div className="row">
          <p className="error" role="alert">{error}</p>
          {failedAt > 0 && (
            <button className="btn" onClick={() => run(true)}>
              Continue from {STEPS[failedAt]}
            </button>
          )}
        </div>
      )}

      {personas.length > 0 && (
        <section aria-label="Simulated customers">
          <h3 className="sim-h">Customers{rounds.length ? `: after round ${rounds.length}` : ""}</h3>
          <ul className="sim-personas">
            {personas.map((p, i) => {
              const r = last.find((x) => x.name === p.name) || last[i];
              const before = first.find((x) => x.name === p.name) || first[i];
              return (
                <li key={p.name} className={`card sim-persona ${r ? `d-${r.decision}` : "waiting"}`}>
                  <div className="item-head">
                    <p className="item-title">{p.name}</p>
                    {r && <span className={`sim-d d-${r.decision}`}>{r.decision}</span>}
                  </div>
                  <p className="muted">{p.segment}{p.city ? ` · ${p.city}` : ""}</p>
                  <p className="sim-role">{p.role}</p>
                  {r?.says && <q>{r.says}</q>}
                  {r?.objection && <p className="muted"><b>Worry:</b> {r.objection}</p>}
                  {rounds.length > 1 && before && r && before.decision !== r.decision && (
                    <p className="sim-changed">
                      Changed: {before.decision} → {r.decision}
                      {r.influenced_by ? ` after hearing ${r.influenced_by}` : ""}
                    </p>
                  )}
                  {!r && <p className="muted">Thinking…</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {report && <Report product={product} report={report} onSpeak={onSpeak} />}
    </>
  );
}

function Report({ product, report: r, onSpeak }) {
  const pull = r.pull;
  return (
    <section className="sim-report" aria-label="Simulation report">
      <div className={`gap ${pull >= 6.5 ? "go" : pull < 4 ? "kill" : ""}`}>
        <p className="sim-eyebrow">Report: {product}</p>
        <div className="verdict">
          <strong>{pull}</strong>
          <span>out of 10 market pull</span>
        </div>
        <Decisions counts={r.counts} />
        {r.headline && <p>{r.headline}</p>}
        {r.say && <button className="link" onClick={() => onSpeak?.(r.say)}>Hear the summary</button>}
      </div>

      <div className="sim-scen">
        {[
          ["skeptical", "Skeptical"],
          ["base", "Base"],
          ["optimistic", "Optimistic"],
        ].map(([k, l]) => (
          <div key={k} className={`card sc-${k}`}>
            <p className="muted">{l}</p>
            <p className="sim-big">{r.scenarios[k].pilots_of_10}<small>/10 pilots</small></p>
            <p className="muted">{r.scenarios[k].story}</p>
          </div>
        ))}
      </div>

      {r.segments.length > 0 && (
        <Block title="Segments">
          <ul className="list compact">
            {r.segments.map((s) => (
              <li key={s.name} className="sim-seg">
                <span className={`ov-tag fit-${s.fit}`}>{s.fit}</span> <b>{s.name}</b>: {s.why}
              </li>
            ))}
          </ul>
        </Block>
      )}
      <Lines title="Objections" items={r.objections} />
      <Lines title="What makes them say yes" items={r.triggers} />
      <Lines title="Trust barriers" items={r.trust_barriers} />
      {r.pricing && <Block title="Price">{<p>{r.pricing}</p>}</Block>}
      {r.search_words.length > 0 && (
        <Block title="Words they'd search for">
          <ul className="sim-chips">{r.search_words.map((w) => <li key={w}>{w}</li>)}</ul>
        </Block>
      )}
      <Lines title="Fragile assumptions" items={r.fragile} />
      {r.hypotheses.length > 0 && (
        <Block title="5 things to test with real people">
          <ol className="sim-ol">{r.hypotheses.map((h) => <li key={h}>{h}</li>)}</ol>
        </Block>
      )}
      {r.next_test?.name && (
        <div className="gap test-card">
          <p className="test-name">Next 48 hours: {r.next_test.name}</p>
          <p>{r.next_test.do}</p>
          <p className="muted">Costs {r.next_test.cost}. It passes if: {r.next_test.pass}</p>
        </div>
      )}
    </section>
  );
}

function Block({ title, children }) {
  return (
    <div className="sim-block">
      <h3 className="sim-h">{title}</h3>
      {children}
    </div>
  );
}

function Lines({ title, items }) {
  if (!items?.length) return null;
  return (
    <Block title={title}>
      <ul className="sim-ul">{items.map((x) => <li key={x}>{x}</li>)}</ul>
    </Block>
  );
}

function Bar({ label, value, strong }) {
  return (
    <div className={`score ${strong ? "strong" : ""}`}>
      <dt>{label}</dt>
      <dd>
        <span className="bar" style={{ "--w": `${Math.max(0, Math.min(10, value)) * 10}%` }} />
        <b>{value}</b>
      </dd>
    </div>
  );
}

function Decisions({ counts }) {
  const total = DECISIONS.reduce((s, [k]) => s + (counts?.[k] || 0), 0) || 1;
  return (
    <div className="sim-dec">
      <div className="sim-strip" role="img" aria-label={DECISIONS.map(([k, l]) => `${counts?.[k] || 0} ${l}`).join(", ")}>
        {DECISIONS.map(([k]) => (counts?.[k] ? <span key={k} className={`d-${k}`} style={{ flex: counts[k] / total }} /> : null))}
      </div>
      <p className="sim-legend">
        {DECISIONS.map(([k, l]) => (
          <span key={k}><i className={`d-${k}`} aria-hidden="true" />{counts?.[k] || 0} {l}</span>
        ))}
      </p>
    </div>
  );
}
