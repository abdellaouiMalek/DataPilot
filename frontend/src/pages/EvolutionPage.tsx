import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, ArrowRight, Sparkles, Check, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Navbar } from '../components/Navbar';
import { FlowHeader } from '../components/FlowHeader';
import { getMaturityLevels, bankLogoSrc } from '../lib/config';
import type { MaturityLevel } from '../lib/config';
import { getMyAssessments } from '../lib/assessment';
import type { AssessmentResult } from '../lib/assessment';
import { getComparisonNarrative } from '../lib/recommendations';
import { downloadComparisonReport } from '../lib/reports';
import { tint, formatMonthYear } from '../lib/utils';

type NarrStatus = 'idle' | 'loading' | 'streaming' | 'done' | 'error';

export function EvolutionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [maturityLevels, setMaturityLevels] = useState<MaturityLevel[]>([]);
  const [allAssessments, setAllAssessments] = useState<AssessmentResult[]>([]);

  // Les évaluations comparées sont désignées par `?ids=5,6`, et résolues
  // contre la liste que la page charge de toute façon. L'état du routeur ne
  // sert plus qu'au premier rendu, avant l'arrivée de cette liste : lui seul
  // ne survivait ni au rafraîchissement ni à un lien partagé.
  const comparedIds = useMemo(
    () => (searchParams.get('ids') ?? '')
      .split(',')
      .map(Number)
      .filter(Number.isFinite),
    [searchParams],
  );

  const selected: AssessmentResult[] = useMemo(() => {
    const resolved = allAssessments.filter((a) => comparedIds.includes(a.id));
    if (resolved.length) return resolved;
    return (location.state?.selected as AssessmentResult[] | undefined) ?? [];
  }, [allAssessments, comparedIds, location.state]);

  const sortedSelected = useMemo(
    () => [...selected].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [selected]
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrStatus, setNarrStatus] = useState<NarrStatus>('idle');
  const [stream, setStream] = useState('');
  const [narrVersion, setNarrVersion] = useState(0);

  useEffect(() => {
    if (sortedSelected.length < 2) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getMaturityLevels()
      .then((levels) => !cancelled && setMaturityLevels(levels))
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));

    // The full trend line is a secondary enhancement, its failure shouldn't
    // block the (essential) dimension comparison from rendering.
    getMyAssessments()
      .then((mine) => !cancelled && setAllAssessments(mine))
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The N compared evaluations reduce to the same two bookends the radar,
  // KPI strip and AI narrative already knew how to read before this page
  // supported more than a pair: the earliest and the latest of the
  // selection. Evaluations in between only feed the trend chart and the
  // per-dimension table's extra columns.
  const stateInit = sortedSelected[0];
  const stateCurr = sortedSelected[sortedSelected.length - 1];

  // Executive synthesis, a single LLM-authored analysis of the evolution
  // between the two bookend periods together (not one narrative per
  // period read side by side), streamed in.
  useEffect(() => {
    if (!stateInit || !stateCurr) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    setNarrStatus('loading');
    setStream('');
    setNarrative(null);

    getComparisonNarrative(stateInit.id, stateCurr.id)
      .then((res) => {
        if (cancelled) return;
        setNarrative(res.narrative);
        setNarrStatus('streaming');

        let i = 0;
        interval = setInterval(() => {
          i += Math.floor(Math.random() * 5) + 3;
          if (i >= res.narrative.length) {
            setStream(res.narrative);
            if (interval) clearInterval(interval);
            setNarrStatus('done');
          } else {
            setStream(res.narrative.slice(0, i));
          }
        }, 12);
      })
      .catch(() => {
        if (!cancelled) setNarrStatus('error');
      });

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [stateInit?.id, stateCurr?.id, narrVersion]);

  if (sortedSelected.length < 2) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex flex-col items-center justify-center gap-4 px-6 text-center py-32">
          <p className="text-sm font-medium text-gray-600 max-w-md">
            Aucune comparaison sélectionnée. Choisissez au moins deux évaluations dans votre historique pour lancer une comparaison.
          </p>
          <button
            onClick={() => navigate('/historique')}
            className="px-5 py-2.5 rounded-lg text-sm font-bold bg-gray-900 text-white hover:bg-black transition-colors"
          >
            Retour à l'historique
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 py-32">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm font-medium">Chargement de la comparaison…</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex flex-col items-center justify-center gap-4 px-6 text-center py-32">
          <p className="text-sm font-medium text-gray-600 max-w-md">
            Impossible de charger la comparaison. Vérifiez que l'API est démarrée, puis réessayez.
          </p>
          <button
            onClick={() => navigate('/historique')}
            className="px-5 py-2.5 rounded-lg text-sm font-bold bg-gray-900 text-white hover:bg-black transition-colors"
          >
            Retour à l'historique
          </button>
        </div>
      </div>
    );
  }

  const getMaturityLevel = (score: number) =>
    maturityLevels.find((l) => score >= l.min_score && score <= l.max_score) || maturityLevels[0];

  const scoreInit = stateInit.score_global ?? 0;
  const scoreCurr = stateCurr.score_global ?? 0;
  const delta = scoreCurr - scoreInit;
  const levelInit = getMaturityLevel(scoreInit);
  const levelCurr = getMaturityLevel(scoreCurr);
  const bank = stateCurr.bank;

  // A score per compared evaluation, oldest to newest, keyed by dimension --
  // the detail table shows every period, but a dimension only counts as
  // "compared" (and only figures in the radar/variation/KPI figures) when
  // both bookends scored it, since the questionnaire's dimension set can
  // change between submissions and the bookends are what everything else
  // here reads movement off.
  const dimMap = new Map<string, { name: string; scores: (number | null)[] }>();
  sortedSelected.forEach((a, i) => {
    for (const d of a.dimension_scores) {
      if (!dimMap.has(d.key)) {
        dimMap.set(d.key, { name: d.name, scores: new Array<number | null>(sortedSelected.length).fill(null) });
      }
      dimMap.get(d.key)!.scores[i] = d.score;
    }
  });
  const dimensionScores = Array.from(dimMap.entries())
    .filter(([, v]) => v.scores[0] !== null && v.scores[v.scores.length - 1] !== null)
    .map(([key, v]) => ({
      key,
      dim: v.name,
      scores: v.scores,
      initial: v.scores[0] as number,
      current: v.scores[v.scores.length - 1] as number,
    }));

  const radarData = dimensionScores.map((d) => ({ dimension: d.dim, initial: d.initial, current: d.current, fullMark: 5 }));

  const improved = dimensionScores.filter((d) => d.current - d.initial > 0.05).length;
  const stable = dimensionScores.filter((d) => Math.abs(d.current - d.initial) <= 0.05).length;
  const declined = dimensionScores.filter((d) => d.current - d.initial < -0.05).length;

  // The detail table below gets one narrow column per compared evaluation,
  // so its grid template (and minimum scroll width) scale with N -- built
  // at runtime, hence inline styles rather than a Tailwind arbitrary class.
  const periodCount = sortedSelected.length;
  const tableGridTemplate = `1.4fr repeat(${periodCount}, 60px) 96px 180px`;
  const tableMinWidth = 460 + periodCount * 68;

  // The N compared evaluations, not the bank's full history -- this chart
  // is the on-screen equivalent of the PDF report's score-trend figure.
  const historicalTrend = sortedSelected.map((a) => ({
    period: formatMonthYear(a.created_at), score: a.score_global ?? 0,
  }));

  const aiActive = narrStatus === 'loading' || narrStatus === 'streaming';

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 space-y-5">

        {/* ── Fil d'Ariane + export ──
            Pas de bouton de retour ici : les deux maillons du fil restent
            cliquables, et la place de droite revient à l'action de la page. */}
        <FlowHeader
          current={`Évolution, ${bank}`}
          parent={{ label: 'Mes évaluations', to: '/historique' }}
          action={(
            <button
              onClick={() => toast.promise(downloadComparisonReport(sortedSelected.map((a) => a.id)), {
                loading: 'Génération du rapport PDF…',
                success: 'Rapport PDF téléchargé',
                error: 'Échec du téléchargement du rapport PDF',
              })}
              className="flex items-center gap-1.5 text-xs font-semibold border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors px-3 py-2 rounded-lg"
            >
              <Download className="w-3.5 h-3.5" /> Exporter PDF
            </button>
          )}
        />

        {/* ── Title + period selectors ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="bg-white border border-gray-200 rounded-xl px-7 py-5 flex flex-col md:flex-row md:items-center justify-between gap-5"
        >
          <div className="flex items-center gap-3 min-w-0">
            {stateCurr.bank_logo_url && (
              <img
                src={bankLogoSrc(stateCurr.bank_logo_url) ?? undefined}
                alt=""
                className="w-9 h-9 rounded-full object-contain bg-white border border-gray-100 flex-shrink-0"
              />
            )}
            <div className="min-w-0">
              <p className="text-[9px] font-bold tracking-[0.22em] text-gray-400 mb-1">ANALYSE D'ÉVOLUTION</p>
              <h1 className="text-lg font-bold text-gray-900 truncate">{bank}</h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end gap-1">
              <span className="text-[9px] font-bold tracking-[0.16em] text-gray-400">ÉVALUATIONS COMPARÉES</span>
              <span className="text-sm font-bold text-gray-900 tabular-nums">{sortedSelected.length}</span>
            </div>
            <div className="w-px h-8 bg-gray-100" />
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-medium text-gray-500">{formatMonthYear(stateInit.created_at)}</span>
              <ArrowRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
              <span className="text-sm font-bold text-gray-900">{formatMonthYear(stateCurr.created_at)}</span>
            </div>
          </div>
        </motion.div>

        {/* ── KPI strip ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.07 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-5">
            <p className="text-[9px] font-bold tracking-[0.18em] text-gray-400 mb-3">SCORE INITIAL</p>
            <div className="flex items-baseline gap-1.5 mb-3">
              <span className="text-4xl font-bold text-gray-400 leading-none tabular-nums">{scoreInit.toFixed(1)}</span>
              <span className="text-xs text-gray-300 font-medium">/ 5</span>
            </div>
            <span
              className="inline-flex items-center px-2.5 py-1 rounded text-[10px] font-semibold border"
              style={{ backgroundColor: tint(levelInit.color, '1a'), color: '#111827', borderColor: tint(levelInit.color, '55') }}
            >{levelInit.label}</span>
            <p className="text-[9px] text-gray-400 mt-2 font-medium">{formatMonthYear(stateInit.created_at)}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl px-5 py-5">
            <p className="text-[9px] font-bold tracking-[0.18em] text-gray-400 mb-3">SCORE ACTUEL</p>
            <div className="flex items-baseline gap-1.5 mb-3">
              <span className="text-4xl font-bold text-gray-900 leading-none tabular-nums">{scoreCurr.toFixed(1)}</span>
              <span className="text-xs text-gray-300 font-medium">/ 5</span>
            </div>
            <span
              className="inline-flex items-center px-2.5 py-1 rounded text-[10px] font-semibold border"
              style={{ backgroundColor: tint(levelCurr.color, '1a'), color: '#111827', borderColor: tint(levelCurr.color, '55') }}
            >{levelCurr.label}</span>
            <p className="text-[9px] text-gray-400 mt-2 font-medium">{formatMonthYear(stateCurr.created_at)}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl px-5 py-5 flex flex-col relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-[#FFE600]" />
            <p className="text-[9px] font-bold tracking-[0.18em] text-gray-400 mb-3 mt-1">PROGRESSION</p>
            <div className="flex items-baseline gap-1.5 mb-3">
              <span className={`text-4xl font-bold leading-none tabular-nums ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                {delta > 0 ? '+' : ''}{delta.toFixed(1)}
              </span>
              <span className="text-xs text-gray-300 font-medium">pts</span>
            </div>
            <div className="flex items-center gap-1.5 mt-auto">
              {delta > 0 ? (
                <><TrendingUp className="w-3.5 h-3.5 text-emerald-500" /><span className="text-xs font-semibold text-emerald-600">En progression</span></>
              ) : delta < 0 ? (
                <><TrendingDown className="w-3.5 h-3.5 text-red-400" /><span className="text-xs font-semibold text-red-500">En recul</span></>
              ) : (
                <><Minus className="w-3.5 h-3.5 text-gray-300" /><span className="text-xs font-semibold text-gray-400">Stable</span></>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl px-5 py-5">
            <p className="text-[9px] font-bold tracking-[0.18em] text-gray-400 mb-3">DIMENSIONS</p>
            <div className="space-y-2 mt-1">
              {[
                { n: improved, label: 'En progrès', color: 'text-emerald-600', dot: 'bg-emerald-500' },
                { n: stable, label: 'Stables', color: 'text-gray-400', dot: 'bg-gray-300' },
                { n: declined, label: 'En recul', color: 'text-red-500', dot: 'bg-red-400' },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    <span className="text-xs text-gray-500">{s.label}</span>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${s.color}`}>{s.n}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── Radar + Trend ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.14 }}
          className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-5"
        >
          <div className="bg-white border border-gray-200 rounded-xl px-7 py-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="text-[9px] font-bold tracking-[0.2em] text-gray-400 mb-1">RADAR DE MATURITÉ</p>
                <p className="text-sm font-bold text-gray-900">Comparaison par dimension</p>
              </div>
              <div className="flex flex-col gap-2 items-end">
                <div className="flex items-center gap-2">
                  <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
                  <span className="text-[10px] text-gray-400">{formatMonthYear(stateInit.created_at)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#111827" strokeWidth="2" /></svg>
                  <span className="text-[10px] text-gray-700 font-semibold">{formatMonthYear(stateCurr.created_at)}</span>
                </div>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="68%">
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis dataKey="dimension" tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 500 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fill: '#d1d5db', fontSize: 9 }} />
                  <Radar name="initial" dataKey="initial" stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="5 4" fill="#cbd5e1" fillOpacity={0.1} />
                  <Radar name="current" dataKey="current" stroke="#111827" strokeWidth={2.5} fill="#FFE600" fillOpacity={0.18} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl px-6 py-6 flex flex-col">
            <p className="text-[9px] font-bold tracking-[0.2em] text-gray-400 mb-1">TENDANCE</p>
            <p className="text-sm font-bold text-gray-900 mb-5">Score consolidé, {sortedSelected.length} évaluations</p>
            {historicalTrend.length >= 2 ? (
              <>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historicalTrend} margin={{ top: 4, right: 10, bottom: 0, left: -26 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="period" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[1, 5]} tick={{ fill: '#9ca3af', fontSize: 9 }} axisLine={false} tickLine={false} ticks={[1, 2, 3, 4, 5]} />
                      <ReferenceLine y={3} stroke="#e5e7eb" strokeDasharray="4 3" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: '#FFE600', fontWeight: 700 }}
                        itemStyle={{ color: '#fff' }}
                        formatter={(value) => [`${Number(value).toFixed(1)} / 5`, 'Score']}
                      />
                      <Line
                        type="monotone" dataKey="score"
                        stroke="#111827" strokeWidth={2}
                        dot={{ r: 4, fill: '#FFE600', stroke: '#111827', strokeWidth: 1.5 }}
                        activeDot={{ r: 5.5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Score passé de <strong className="text-gray-800">{scoreInit.toFixed(1)}</strong> à <strong className="text-gray-800">{scoreCurr.toFixed(1)}</strong>, progression de <strong className="text-gray-900">{delta > 0 ? '+' : ''}{delta.toFixed(1)} pt</strong>
                  </p>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-gray-400 text-center py-8">
                Tendance indisponible pour le moment.
              </div>
            )}
          </div>
        </motion.div>

        {/* ── Dimension table ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.21 }}
          className="bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto"
        >
          <div style={{ minWidth: tableMinWidth }}>
            <div className="grid gap-4 px-7 py-3 bg-gray-50 border-b border-gray-100" style={{ gridTemplateColumns: tableGridTemplate }}>
              <span className="text-[9px] font-bold tracking-[0.16em] text-gray-400">DIMENSION</span>
              {sortedSelected.map((a) => (
                <span key={a.id} className="text-[9px] font-bold tracking-[0.16em] text-gray-400 text-right">
                  {formatMonthYear(a.created_at).toUpperCase()}
                </span>
              ))}
              <span className="text-[9px] font-bold tracking-[0.16em] text-gray-400 text-right">VARIATION</span>
              <span className="text-[9px] font-bold tracking-[0.16em] text-gray-400">ÉVOLUTION</span>
            </div>

            {dimensionScores.map((d, i) => {
              const diff = d.current - d.initial;
              const isProgress = diff > 0.05;
              const isDecline = diff < -0.05;
              const pctCurrent = (d.current / 5) * 100;
              const pctInitial = (d.initial / 5) * 100;
              const barColor = isProgress ? '#111827' : isDecline ? '#ef4444' : '#94a3b8';

              return (
                <motion.div
                  key={d.key}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25, delay: 0.27 + i * 0.045 }}
                  className="grid gap-4 px-7 py-4 items-center border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60 transition-colors"
                  style={{ gridTemplateColumns: tableGridTemplate }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-0.5 h-5 rounded-full shrink-0" style={{ backgroundColor: barColor }} />
                    <span className="text-sm font-medium text-gray-800 truncate">{d.dim}</span>
                  </div>

                  {d.scores.map((s, si) => (
                    <span
                      key={si}
                      className={`text-sm tabular-nums text-right ${
                        si === d.scores.length - 1 ? 'font-bold text-gray-900' : 'font-semibold text-gray-400'
                      }`}
                    >
                      {s !== null ? s.toFixed(1) : '—'}
                    </span>
                  ))}

                  <div>
                    {isProgress ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        +{diff.toFixed(1)} ▲
                      </span>
                    ) : isDecline ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-200">
                        {diff.toFixed(1)} ▼
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold bg-gray-100 text-gray-400">
                        <Minus className="w-3 h-3" />stable
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="relative h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="absolute inset-y-0 left-0 bg-gray-300 rounded-full" style={{ width: `${pctInitial}%` }} />
                    </div>
                    <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ backgroundColor: barColor }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pctCurrent}%` }}
                        transition={{ duration: 0.9, delay: 0.32 + i * 0.05, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* ── AI comparative analysis ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.32 }}
          className="bg-white border border-gray-200 rounded-xl p-6 sm:p-8"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-[10px] font-bold tracking-[0.2em] text-gray-400">SYNTHÈSE IA</p>
            </div>
            <div className="flex items-center gap-3">
              {aiActive && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.div key={i} className="w-1.5 h-1.5 bg-[#FFE600] rounded-full"
                        animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} />
                    ))}
                  </div>
                  Analyse en cours…
                </div>
              )}
              {narrStatus === 'done' && (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                  <Check className="w-3.5 h-3.5" /> Analyse complète
                </div>
              )}
              {(narrStatus === 'done' || narrStatus === 'error') && (
                <button
                  onClick={() => setNarrVersion((v) => v + 1)}
                  className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                >{narrStatus === 'error' ? 'Réessayer' : 'Regénérer'}</button>
              )}
              <span className="text-[9px] font-bold tracking-[0.14em] text-gray-400 border border-gray-200 px-2.5 py-1 rounded-full hidden sm:inline">EY AI ENGINE</span>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-6">Analyse comparative de l'évolution, générée par le moteur EY AI</p>

          {narrStatus === 'error' ? (
            <p className="text-sm text-gray-400 text-center py-6">
              L'analyse IA est momentanément indisponible. Réessayez dans quelques instants.
            </p>
          ) : narrStatus === 'loading' ? (
            <div className="space-y-3 animate-pulse">
              {[80, 60, 90, 50].map((w) => (
                <div key={w} className="h-2.5 bg-gray-100 rounded-full" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : (
            <div>
              <p className="text-[9px] font-bold tracking-[0.18em] text-gray-400 mb-2">
                {sortedSelected.length > 2 ? `${sortedSelected.length} ÉVALUATIONS · ` : ''}
                {formatMonthYear(stateInit.created_at).toUpperCase()} → {formatMonthYear(stateCurr.created_at).toUpperCase()}
              </p>
              <p className="text-sm text-gray-600 leading-relaxed">
                {narrStatus === 'streaming' ? stream : narrative}
                {narrStatus === 'streaming' && (
                  <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.55, repeat: Infinity }}
                    className="inline-block w-[2px] h-[14px] bg-gray-400 ml-0.5 align-middle" />
                )}
              </p>
            </div>
          )}
        </motion.div>

      </div>
    </div>
  );
}
