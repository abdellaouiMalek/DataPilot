import { useState, useEffect, useMemo, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Navbar } from '../components/Navbar';
import {
  ChevronRight,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { getRecommendations, getNarrative } from '../lib/recommendations';
import type { RecommendationOut } from '../lib/recommendations';
import { getDimensions } from '../lib/config';

const SERIF: CSSProperties = {
  fontFamily: "'Source Serif 4', Georgia, 'Times New Roman', serif",
};

const EFFORT_META: Record<number, { label: string; color: string }> = {
  1: { label: 'Effort faible', color: '#2E7D32' },
  2: { label: 'Effort moyen', color: '#E65100' },
  3: { label: 'Effort élevé', color: '#d4183d' },
};

const CATEGORY_LABELS: Record<string, string> = {
  strategie: 'Stratégie',
  gouvernance: 'Gouvernance',
  qualite: 'Qualité',
  architecture: 'Architecture',
  securite: 'Sécurité',
  analytique: 'Analytique',
  competences: 'Compétences',
  process: 'Process',
};

type EffortFilter = 'all' | 1 | 2 | 3;

const EFFORT_FILTERS: { value: EffortFilter; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 1, label: 'Effort faible' },
  { value: 2, label: 'Effort moyen' },
  { value: 3, label: 'Effort élevé' },
];

/**
 * Five-node rail for the 1–5 maturity scale: solid nodes mark levels the
 * bank already holds, the amber node/segment marks the step this specific
 * recommendation delivers, hollow nodes mark levels still ahead.
 */
function MaturityRail({ trigger, target }: { trigger: number; target: number }) {
  const levels = [1, 2, 3, 4, 5];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center">
        {levels.map((level, i) => {
          const isAchieved = level < trigger;
          const isCurrent = level === trigger;
          const isTarget = level === target;
          const nodeColor = isTarget
            ? 'bg-[#FFE600] border-[#1A1A1A]'
            : isAchieved || isCurrent
            ? 'bg-[#1A1A1A] border-[#1A1A1A]'
            : 'bg-white border-black/15';
          return (
            <div key={level} className="flex items-center">
              <div
                className={`w-2.5 h-2.5 rounded-full border shrink-0 ${nodeColor}`}
                title={`Niveau ${level}`}
              />
              {i < levels.length - 1 && (
                <div
                  className={`w-3 sm:w-4 h-[2px] ${
                    level < trigger
                      ? 'bg-[#1A1A1A]'
                      : level === trigger
                      ? 'bg-[#FFE600]'
                      : 'bg-black/10'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      <span className="text-[9px] tracking-widest text-black/50 uppercase font-mono">
        Niveau {trigger} → {target}
      </span>
    </div>
  );
}

// --- MAIN COMPONENT ---
export function RecommendationsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const assessmentId: number | undefined = location.state?.assessmentId;

  const [recommendations, setRecommendations] = useState<RecommendationOut[]>([]);
  const [dimensionNames, setDimensionNames] = useState<Record<number, string>>({});
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [effortFilter, setEffortFilter] = useState<EffortFilter>('all');
  const [completedCodes, setCompletedCodes] = useState<string[]>([]);

  useEffect(() => {
    if (!assessmentId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([getRecommendations(assessmentId), getDimensions()])
      .then(([recs, dims]) => {
        if (cancelled) return;
        setRecommendations(recs);
        const names: Record<number, string> = {};
        for (const d of dims) names[d.id] = d.name;
        setDimensionNames(names);
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));

    // The executive synthesis is a secondary enhancement — its failure
    // shouldn't block the (essential) recommendations list from rendering.
    getNarrative(assessmentId)
      .then((res) => !cancelled && setNarrative(res.narrative))
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [assessmentId]);

  // The recommendations call can take several minutes (each of the top
  // items gets a real, local LLM reformulation on CPU) — a bare spinner
  // reads as broken past ~10s, so this surfaces elapsed time and updates
  // the message in stages to keep the wait legible.
  useEffect(() => {
    if (!loading) {
      setLoadingSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [loading]);

  const loadingMessage =
    loadingSeconds < 10
      ? 'Calcul des recommandations…'
      : loadingSeconds < 30
      ? 'Analyse de votre profil de maturité…'
      : "Génération des reformulations par IA locale — cela peut prendre plusieurs minutes sur ce modèle…";

  const toggleComplete = (code: string) => {
    setCompletedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const filteredRecommendations = useMemo(
    () =>
      effortFilter === 'all'
        ? recommendations
        : recommendations.filter((r) => r.effort === effortFilter),
    [recommendations, effortFilter]
  );

  const lowEffortCount = recommendations.filter((r) => r.effort === 1).length;
  const regulatoryCount = recommendations.filter((r) => r.regulatory_flag).length;
  const maxScore = Math.max(1, ...recommendations.map((r) => r.score));

  if (!assessmentId) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="flex flex-col items-center justify-center gap-4 px-6 text-center py-32">
          <p className="text-sm font-medium text-gray-600 max-w-md">
            Aucune évaluation sélectionnée. Complétez une évaluation pour obtenir vos recommandations.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 text-sm font-bold bg-black text-white hover:bg-gray-800 transition-colors"
          >
            Démarrer une évaluation
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="flex flex-col items-center justify-center gap-3 text-gray-400 py-32 px-6 text-center">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm font-medium max-w-sm">{loadingMessage}</span>
          {loadingSeconds >= 10 && (
            <span className="text-xs tabular-nums text-gray-300">
              {Math.floor(loadingSeconds / 60)}:{String(loadingSeconds % 60).padStart(2, '0')}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="flex flex-col items-center justify-center gap-4 px-6 text-center py-32">
          <p className="text-sm font-medium text-gray-600 max-w-md">
            Impossible de charger les recommandations. Vérifiez que l'API est démarrée, puis réessayez.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 text-sm font-bold bg-black text-white hover:bg-gray-800 transition-colors"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-14">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 sm:mb-10 border-b border-black/10 pb-8 sm:pb-10"
        >
          <span className="text-[10px] font-bold tracking-[0.25em] text-black/50 uppercase font-mono">
            Plan d'action — Réf. dossier #{assessmentId}
          </span>
          <h1 className="mt-2 text-3xl sm:text-5xl font-light leading-tight text-black">
            Recommandations priorisées
          </h1>

          {/* Executive synthesis — the LLM-authored narrative of the bank's
              results, set in the serif "analysis voice" to read as written
              counsel rather than interface copy. */}
          {narrative && (
            <p
              style={SERIF}
              className="mt-5 max-w-3xl text-base sm:text-lg text-black/80 leading-relaxed border-l-2 border-[#FFE600] pl-4"
            >
              {narrative}
            </p>
          )}

          {/* Stat rule — inline metrics, not a widget grid */}
          <div className="mt-7 flex flex-wrap items-center gap-x-8 gap-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-light tabular-nums">{recommendations.length}</span>
              <span className="text-[11px] uppercase tracking-wider text-black/50 font-mono">
                Actions identifiées
              </span>
            </div>
            <div className="h-8 w-px bg-black/10 hidden sm:block" />
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-light tabular-nums">{regulatoryCount}</span>
              <span className="text-[11px] uppercase tracking-wider text-black/50 font-mono">
                Obligations réglementaires
              </span>
            </div>
            <div className="h-8 w-px bg-black/10 hidden sm:block" />
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-light tabular-nums">{lowEffortCount}</span>
              <span className="text-[11px] uppercase tracking-wider text-black/50 font-mono">
                Gains rapides
              </span>
            </div>
          </div>
        </motion.div>

        {/* Filters — underline tabs, report table-of-contents register */}
        <div className="mb-8 flex gap-1 overflow-x-auto scrollbar-none border-b border-black/10">
          {EFFORT_FILTERS.map(({ value, label }) => {
            const count =
              value === 'all'
                ? recommendations.length
                : recommendations.filter((r) => r.effort === value).length;
            const active = effortFilter === value;
            return (
              <button
                key={value}
                onClick={() => setEffortFilter(value)}
                className={`whitespace-nowrap px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 -mb-px transition-colors ${
                  active
                    ? 'border-black text-black'
                    : 'border-transparent text-black/45 hover:text-black/70'
                }`}
              >
                {label}
                <span className="ml-1.5 text-black/35 tabular-nums">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Recommendations List */}
        {filteredRecommendations.length === 0 ? (
          <div className="p-10 text-center border border-black/10 bg-[#fafafa] text-sm text-black/60">
            {recommendations.length === 0
              ? "Aucune recommandation : votre niveau de maturité est déjà optimal sur l'ensemble des dimensions évaluées."
              : 'Aucune recommandation ne correspond à ce filtre.'}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRecommendations.map((rec, index) => {
              const isCompleted = completedCodes.includes(rec.code);
              const isTopPriority = rec.rank === 1;
              const dimensionLabel =
                dimensionNames[rec.dimension_id] ?? CATEGORY_LABELS[rec.category] ?? rec.category;
              const effortMeta = EFFORT_META[rec.effort];
              const scoreBarWidth = Math.max(6, (rec.score / maxScore) * 100);

              return (
                <motion.div
                  key={rec.code}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.03 }}
                  className={`border transition-colors ${
                    isCompleted
                      ? 'border-black/10 bg-black/[0.02]'
                      : isTopPriority
                      ? 'border-black/10 border-l-4 border-l-[#FFE600]'
                      : 'border-black/10 hover:border-black/25'
                  }`}
                >
                  <div className="p-5 sm:p-7">
                    {/* Top meta row */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold tracking-widest text-black/40 uppercase font-mono">
                          {rec.code}
                        </span>
                        <span className="text-black/15">·</span>
                        <span className="text-[10px] tracking-widest text-black/60 uppercase font-mono">
                          {dimensionLabel}
                        </span>
                        {isTopPriority && (
                          <span className="inline-flex items-center text-[9px] font-bold tracking-widest uppercase bg-[#FFE600] text-black px-2 py-0.5">
                            Priorité n°1
                          </span>
                        )}
                        {rec.regulatory_flag && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-widest uppercase border border-[#0277BD]/30 text-[#0277BD] px-2 py-0.5">
                            <ShieldCheck className="w-2.5 h-2.5" />
                            Obligation réglementaire
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => toggleComplete(rec.code)}
                        className={`flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 border transition-colors ${
                          isCompleted
                            ? 'bg-[#2E7D32] border-[#2E7D32] text-white'
                            : 'border-black/15 text-black/50 hover:border-black/40 hover:text-black/70'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        {isCompleted ? 'Traité' : 'À traiter'}
                      </button>
                    </div>

                    {/* Main content: rail + narrative */}
                    <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 sm:gap-8">
                      <div className="sm:pt-1">
                        <MaturityRail trigger={rec.trigger_level} target={rec.target_level} />
                      </div>

                      <div
                        className={`space-y-2.5 min-w-0 ${isCompleted ? 'opacity-50' : ''}`}
                      >
                        <h3
                          className={`text-lg sm:text-xl font-semibold break-words ${
                            isCompleted ? 'line-through text-black/40' : 'text-black'
                          }`}
                        >
                          {rec.title}
                        </h3>
                        <p
                          style={SERIF}
                          className="text-sm sm:text-base text-black/75 leading-relaxed break-words"
                        >
                          {rec.texte_reformule}
                        </p>

                        {/* Justification — the model's grounded reasoning,
                            in the same analysis voice as the narrative above. */}
                        <div className="pt-2 border-t border-black/5">
                          <span className="text-[9px] font-bold tracking-widest text-black/40 uppercase font-mono">
                            Pourquoi cette priorité
                          </span>
                          <p style={SERIF} className="mt-1 text-sm italic text-black/65">
                            {rec.justification}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Footer: effort + score */}
                    <div className="mt-5 pt-4 border-t border-black/5 flex flex-wrap items-center justify-between gap-4">
                      <span
                        className="inline-flex items-center text-[10px] font-bold tracking-widest uppercase px-2 py-1 border"
                        style={{ color: effortMeta.color, borderColor: `${effortMeta.color}40` }}
                      >
                        {effortMeta.label}
                      </span>

                      <div className="flex items-center gap-2 min-w-[140px]">
                        <span className="text-[10px] uppercase tracking-wider text-black/40 font-mono shrink-0">
                          Score
                        </span>
                        <div className="flex-1 h-1 bg-black/5 max-w-[100px]">
                          <div
                            className="h-full bg-[#1A1A1A]"
                            style={{ width: `${scoreBarWidth}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold tabular-nums w-10 text-right">
                          {rec.score.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Bottom CTA Block */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-10 border border-black/10 bg-[#fafafa] p-5 sm:p-10"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-1">
              <h3 className="text-lg sm:text-2xl font-light">Prêt à modéliser l'impact ?</h3>
              <p className="text-xs sm:text-base text-black/70">
                Simulez les gains potentiels de ces recommandations sur vos métriques business.
              </p>
            </div>
            <button
              onClick={() => navigate('/simulation', { state: { assessmentId } })}
              className="w-full lg:w-auto px-5 py-3.5 bg-[#FFE600] hover:bg-[#f5dc00] text-black font-semibold transition-colors flex items-center justify-center gap-2 text-xs sm:text-sm"
            >
              <span>Lancer une simulation</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
