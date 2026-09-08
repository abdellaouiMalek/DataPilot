import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  GitCompare, ExternalLink, TrendingUp, TrendingDown, Minus,
  ChevronUp, ChevronDown as ChevDesc, ChevronLeft, ChevronRight,
  Building2, Calendar, Activity, Loader2,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { FlowHeader } from '../components/FlowHeader';
import { getMaturityLevels, bankLogoSrc } from '../lib/config';
import type { MaturityLevel } from '../lib/config';
import { getMyAssessments } from '../lib/assessment';
import type { AssessmentResult } from '../lib/assessment';
import { tint, formatMonthYear } from '../lib/utils';

const PAGE_SIZE = 5;

type SortKey = 'date' | 'score';

export function HistoriquePage() {
  const navigate = useNavigate();

  const [maturityLevels, setMaturityLevels] = useState<MaturityLevel[]>([]);
  const [assessments, setAssessments] = useState<AssessmentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMaturityLevels(), getMyAssessments()])
      .then(([levels, mine]) => {
        if (cancelled) return;
        setMaturityLevels(levels);
        setAssessments(mine);
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const getMaturityLevel = (score: number) =>
    maturityLevels.find((l) => score >= l.min_score && score <= l.max_score) || maturityLevels[0];

  // Chronological (ascending) order drives the "vs previous" delta, kept
  // stable regardless of how the table itself is currently sorted.
  const chronological = useMemo(
    () => [...assessments].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [assessments]
  );
  const prevScoreById = useMemo(() => {
    const map = new Map<number, number | null>();
    chronological.forEach((a, i) => {
      map.set(a.id, i > 0 ? chronological[i - 1].score_global ?? null : null);
    });
    return map;
  }, [chronological]);

  const sorted = useMemo(
    () =>
      [...assessments].sort((a, b) => {
        const v =
          sort.key === 'date'
            ? a.created_at.localeCompare(b.created_at)
            : (a.score_global ?? 0) - (b.score_global ?? 0);
        return v * sort.dir;
      }),
    [assessments, sort]
  );

  const cycleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }));
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const toggleSelect = (id: number) =>
    setCompareIds((p) => (p.includes(id) ? p.filter((i) => i !== id) : [...p, id]));

  const handleCompare = () => {
    if (compareIds.length < 2) return;
    const selected = compareIds
      .map((id) => assessments.find((a) => a.id === id)!)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    // Les ids en query : une comparaison redevient un lien qu'on peut
    // recharger ou coller, ce que l'état du routeur ne permettait pas.
    navigate(`/evolution?ids=${selected.map((a) => a.id).join(',')}`, { state: { selected } });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 py-32">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm font-medium">Chargement de l'historique…</span>
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
            Impossible de charger votre historique. Vérifiez que l'API est démarrée, puis réessayez.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 rounded-lg text-sm font-bold bg-gray-900 text-white hover:bg-black transition-colors"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  if (assessments.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex flex-col items-center justify-center gap-4 px-6 text-center py-32">
          <p className="text-sm font-medium text-gray-600 max-w-md">
            Vous n'avez encore complété aucune évaluation. Démarrez-en une pour commencer à suivre votre progression.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 rounded-lg text-sm font-bold bg-gray-900 text-white hover:bg-black transition-colors"
          >
            Démarrer une évaluation
          </button>
        </div>
      </div>
    );
  }

  const latest = chronological[chronological.length - 1];
  const earliest = chronological[0];
  const totalDelta = (latest.score_global ?? 0) - (earliest.score_global ?? 0);

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => cycleSort(k)}
      className="flex items-center gap-0.5 text-[9px] font-bold tracking-[0.14em] text-gray-400 hover:text-gray-700 transition-colors"
    >
      {label}
      <span className="flex flex-col ml-0.5">
        <ChevronUp className={`w-2 h-2 -mb-0.5 ${sort.key === k && sort.dir === 1 ? 'text-gray-900' : 'text-gray-300'}`} />
        <ChevDesc className={`w-2 h-2 ${sort.key === k && sort.dir === -1 ? 'text-gray-900' : 'text-gray-300'}`} />
      </span>
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 space-y-5">

        <FlowHeader current="Historique" />

        {/* ── Titre ──
            Pas de bouton « Comparer » ici : le bandeau de sélection plus bas
            porte déjà l'action, au moment où elle a un sens. */}
        <div>
          <h1 className="text-lg font-bold text-gray-900">Historique des évaluations</h1>
          <p className="text-xs text-gray-400 mt-0.5">{latest.bank}</p>
        </div>

        {/* ── Summary card ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="bg-white border border-gray-200 rounded-xl overflow-hidden"
        >
          <div className="h-1 bg-[#FFE600]" />
          <div className="px-6 py-5 flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-4 flex-1 min-w-[220px]">
              {latest.bank_logo_url ? (
                <img
                  src={bankLogoSrc(latest.bank_logo_url) ?? undefined}
                  alt=""
                  className="w-11 h-11 rounded-lg object-contain bg-white border border-gray-200 shrink-0"
                />
              ) : (
                <div className="w-11 h-11 bg-gray-900 rounded-lg flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-[#FFE600]" />
                </div>
              )}
              <div>
                <p className="text-[9px] font-bold tracking-[0.2em] text-gray-400 mb-0.5">ÉTABLISSEMENT</p>
                <p className="text-sm font-bold text-gray-900">{latest.bank}</p>
                {latest.evaluator_role && <p className="text-[10px] text-gray-400">{latest.evaluator_role}</p>}
              </div>
            </div>

            <div className="h-12 w-px bg-gray-100 hidden sm:block" />

            {[
              { icon: Activity, label: 'Évaluations', value: assessments.length },
              { icon: Calendar, label: 'Dernière', value: formatMonthYear(latest.created_at) },
              {
                icon: totalDelta >= 0 ? TrendingUp : TrendingDown,
                label: 'Progression totale',
                value: `${totalDelta > 0 ? '+' : ''}${totalDelta.toFixed(1)} pt`,
                color: totalDelta > 0 ? '#16a34a' : totalDelta < 0 ? '#dc2626' : undefined,
              },
              { icon: Activity, label: 'Score actuel', value: `${(latest.score_global ?? 0).toFixed(1)} / 5` },
            ].map((k) => (
              <div key={k.label} className="text-center px-4">
                <p className="text-[8.5px] font-bold tracking-[0.14em] text-gray-400 mb-1">{k.label}</p>
                <p className="text-base font-bold leading-none tabular-nums" style={{ color: k.color || '#111827' }}>
                  {k.value}
                </p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Selection banner ── */}
        <AnimatePresence>
          {compareIds.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="bg-gray-900 rounded-xl px-5 py-3.5 flex flex-wrap items-center gap-4"
            >
              <span className="text-[9px] font-bold tracking-[0.18em] text-white/40 shrink-0">COMPARAISON</span>
              <div className="flex items-center gap-2 flex-1 flex-wrap">
                {compareIds.map((id) => {
                  const ev = assessments.find((e) => e.id === id)!;
                  return (
                    <div key={id} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 border border-white/10">
                      <span className="w-2 h-2 rounded-full shrink-0 bg-[#FFE600]" />
                      <span className="text-xs font-semibold text-white">{formatMonthYear(ev.created_at)}</span>
                      <span className="text-[10px] text-white/40">· {(ev.score_global ?? 0).toFixed(1)}/5</span>
                      <button onClick={() => toggleSelect(id)} className="text-white/25 hover:text-white/60 transition-colors ml-1">
                        ×
                      </button>
                    </div>
                  );
                })}
                {compareIds.length === 1 && (
                  <span className="text-[10px] text-white/30 italic">Sélectionnez au moins une évaluation supplémentaire</span>
                )}
              </div>
              <button
                onClick={handleCompare}
                disabled={compareIds.length < 2}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${
                  compareIds.length >= 2 ? 'bg-[#FFE600] text-gray-900 hover:bg-yellow-300' : 'bg-white/10 text-white/30 cursor-not-allowed'
                }`}
              >
                <GitCompare className="w-3.5 h-3.5" />
                Lancer la comparaison
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Evaluations table ──
            Le défilement horizontal reste cantonné au tableau ; le pied de
            pagination, lui, garde toute la largeur de la carte. */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}
          className="bg-white border border-gray-200 rounded-xl overflow-hidden"
        >
          <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div
              className="grid items-center gap-5 px-6 py-2.5 bg-gray-50 border-b border-gray-200"
              style={{ gridTemplateColumns: '20px 130px 1fr 120px 150px 110px' }}
            >
              <span />
              <SortBtn k="date" label="DATE" />
              <span className="text-[9px] font-bold tracking-[0.14em] text-gray-400">DÉPARTEMENT</span>
              <SortBtn k="score" label="SCORE" />
              <span className="text-[9px] font-bold tracking-[0.14em] text-gray-400">NIVEAU</span>
              <span className="text-[9px] font-bold tracking-[0.14em] text-gray-400">ACTIONS</span>
            </div>

            <div className="divide-y divide-gray-100">
              {paged.map((ev, i) => {
                const score = ev.score_global ?? 0;
                const meta = getMaturityLevel(score);
                const isSelected = compareIds.includes(ev.id);
                const prevScore = prevScoreById.get(ev.id) ?? null;
                const delta = prevScore !== null ? score - prevScore : null;
                const isLatest = ev.id === latest.id;

                return (
                  <motion.div
                    key={ev.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2, delay: 0.15 + i * 0.05 }}
                    className={`grid items-center gap-5 px-6 py-4 transition-colors ${isSelected ? 'bg-amber-50/40' : 'hover:bg-gray-50/60'}`}
                    style={{ gridTemplateColumns: '20px 130px 1fr 120px 150px 110px' }}
                  >
                    <button
                      onClick={() => toggleSelect(ev.id)}
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0 ${
                        isSelected ? 'bg-[#FFE600] border-[#FFE600]' : 'border-gray-300'
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-2.5 h-2.5" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l3 3 5-6" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>

                    <div>
                      <p className="text-sm font-semibold text-gray-900">{formatMonthYear(ev.created_at)}</p>
                      {isLatest && (
                        <span className="text-[8px] font-bold tracking-wide bg-[#FFE600] text-gray-900 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                          DERNIÈRE
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="text-xs text-gray-700 font-medium truncate">{ev.department || '-'}</p>
                      <p className="text-[10px] text-gray-400 truncate">{ev.evaluator_role || '-'}</p>
                      {/* Which published questionnaire this was answered on --
                          a question the framework has since dropped is really
                          gone from the live tables, so the version is the only
                          thing that says what was actually asked.
                          v0 is the reconstructed version standing in for
                          submissions that predate versioning; anything falsy
                          means no version at all. */}
                      <p
                        className="text-[9px] font-semibold text-gray-400 mt-0.5"
                        title={
                          ev.version_number
                            ? `Questionnaire v${ev.version_number}`
                            : "Soumise avant la mise en place des versions, questionnaire reconstitué"
                        }
                      >
                        {ev.version_number ? `Questionnaire v${ev.version_number}` : 'Version antérieure'}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-bold text-gray-900 tabular-nums leading-none">{score.toFixed(1)}</span>
                          <span className="text-[10px] text-gray-300">/5</span>
                        </div>
                        {delta !== null && (
                          <span className={`flex items-center gap-0.5 text-[9px] font-bold mt-0.5 ${delta > 0.05 ? 'text-emerald-600' : delta < -0.05 ? 'text-red-500' : 'text-gray-400'}`}>
                            {delta > 0.05 ? <TrendingUp className="w-2.5 h-2.5" /> : delta < -0.05 ? <TrendingDown className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
                            {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[40px]">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: meta.color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${(score / 5) * 100}%` }}
                          transition={{ duration: 0.9, delay: 0.2 + i * 0.08, ease: 'easeOut' }}
                        />
                      </div>
                    </div>

                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-semibold border w-fit"
                      style={{ backgroundColor: tint(meta.color, '1a'), color: '#111827', borderColor: tint(meta.color, '55') }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                      {ev.maturity_label || meta.label}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/results/${ev.id}`, { state: { result: ev } })}
                        className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 hover:text-gray-900 transition-all"
                      >
                        <ExternalLink className="w-3 h-3" /> Rapport
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-4 px-6 py-3.5 border-t border-gray-100 flex-wrap">
              <span className="text-[11px] text-gray-400">
                Affichage de{' '}
                <strong className="text-gray-700 font-semibold">
                  {(currentPage - 1) * PAGE_SIZE + 1}-{(currentPage - 1) * PAGE_SIZE + paged.length}
                </strong>{' '}
                sur <strong className="text-gray-700 font-semibold">{sorted.length}</strong> évaluation{sorted.length > 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 hover:text-gray-900 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-600"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Précédent
                </button>
                <span className="text-[11px] font-semibold text-gray-500 tabular-nums px-1">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 hover:text-gray-900 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-600"
                >
                  Suivant <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </motion.div>

        <p className="text-[10px] text-gray-400 px-1">
          Cochez plusieurs évaluations pour les comparer et analyser votre progression dans le temps.
        </p>

      </div>
    </div>
  );
}
