import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Check, ArrowRight, Save, Flag, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Navbar } from '@/components/Navbar';
import { getDimensions } from '@/lib/config';
import type { Dimension } from '@/lib/config';
import { submitAssessment } from '@/lib/assessment';
import type { AnswerIn } from '@/lib/assessment';
import { getProfile } from '@/lib/profile';
import { ApiError } from '@/lib/api';

const likertOptions = [
  { value: 1, label: 'Pas du tout', sublabel: 'Inexistant', color: '#ef4444', bg: '#fef2f2', dot: '●' },
  { value: 2, label: 'Faiblement', sublabel: 'Embryonnaire', color: '#f97316', bg: '#fff7ed', dot: '●●' },
  { value: 3, label: 'Partiellement', sublabel: 'En cours', color: '#eab308', bg: '#fefce8', dot: '●●●' },
  { value: 4, label: 'Largement', sublabel: 'Avancé', color: '#22c55e', bg: '#f0fdf4', dot: '●●●●' },
  { value: 5, label: 'Totalement', sublabel: 'Optimisé', color: '#3b82f6', bg: '#eff6ff', dot: '●●●●●' },
];

export function QuestionnairePage() {
  const navigate = useNavigate();
  // Read from the URL, not router state: a not-yet-authenticated user
  // gets bounced through Keycloak's login (RequireAuth) before this page
  // ever renders, which is a real page redirect, not client-side
  // navigation -- router state doesn't survive that round-trip, but the
  // URL (and its query string) does, since it's literally the
  // `redirectUri` Keycloak sends the browser back to.
  const [searchParams] = useSearchParams();
  const profileData = {
    bank: searchParams.get('bank') || '',
    bankId: searchParams.get('bankId') ? Number(searchParams.get('bankId')) : undefined,
    department: searchParams.get('department') || '',
    role: searchParams.get('role') || '',
  };

  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // The bank in the URL was picked while the user might still have been
  // anonymous (see LandingPage). Now that RequireAuth has forced a login,
  // confirm it actually matches the bank Keycloak has them attached to
  // before letting them spend time on the questionnaire -- the backend
  // enforces this at submission anyway (get_bank_scope), but catching it
  // here avoids a wasted 32-question run ending in a generic error.
  const [checkingBank, setCheckingBank] = useState(true);

  const [currentDimensionIndex, setCurrentDimensionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Record<number, number>>>({});
  const [completing, setCompleting] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [justAnswered, setJustAnswered] = useState<number | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setLastSaved(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getDimensions()
      .then((data) => !cancelled && setDimensions(data))
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (profileData.bankId == null) {
      setCheckingBank(false);
      return;
    }
    let cancelled = false;
    getProfile()
      .then((profile) => {
        if (cancelled) return;
        if (profile.bank_id != null && profile.bank_id !== profileData.bankId) {
          navigate('/', { state: { bankMismatch: true } });
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setCheckingBank(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileData.bankId]);

  const totalQuestions = dimensions.reduce((acc, d) => acc + d.questions.length, 0);
  const answeredTotal = Object.values(answers).reduce((acc, dim) => acc + Object.keys(dim).length, 0);
  const globalProgress = totalQuestions ? (answeredTotal / totalQuestions) * 100 : 0;

  const getDimProgress = (dim: Dimension) => {
    const dimAnswers = answers[dim.key] || {};
    return dim.questions.length
      ? (Object.keys(dimAnswers).length / dim.questions.length) * 100
      : 0;
  };

  const handleAnswer = (dimKey: string, questionIndex: number, value: number) => {
    setAnswers((prev) => ({
      ...prev,
      [dimKey]: { ...(prev[dimKey] || {}), [questionIndex]: value },
    }));
    setJustAnswered(questionIndex);
    setTimeout(() => setJustAnswered(null), 600);
  };

  // Flatten the per-dimension/index answer map into the [{question_id, value}]
  // payload the API expects, resolving each index back to its real question id.
  const buildAnswerPayload = (): AnswerIn[] => {
    const payload: AnswerIn[] = [];
    for (const dim of dimensions) {
      const dimAnswers = answers[dim.key] || {};
      for (const [qIndex, value] of Object.entries(dimAnswers)) {
        const question = dim.questions[Number(qIndex)];
        if (question) payload.push({ question_id: question.id, value });
      }
    }
    return payload;
  };

  const handleNext = async () => {
    const isLast = currentDimensionIndex === dimensions.length - 1;
    if (!isLast) {
      setCurrentDimensionIndex((i) => i + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setCompleting(true);
    try {
      const result = await submitAssessment({
        // Guaranteed non-null by the guard below (this handler is only
        // reachable once the form past it has rendered).
        bank_id: profileData.bankId!,
        department: profileData.department,
        evaluator_role: profileData.role,
        answers: buildAnswerPayload(),
      });
      toast.success('Évaluation terminée !', { description: 'Votre profil de maturité est prêt.', duration: 3000 });
      navigate('/results', { state: { result, answers, profile: profileData } });
    } catch (error) {
      setCompleting(false);
      if (error instanceof ApiError && error.status === 403) {
        navigate('/', { state: { bankMismatch: true } });
      } else {
        toast.error('Échec de l\'enregistrement', { description: "Impossible de calculer votre score. Vérifiez que l'API est démarrée, puis réessayez." });
      }
    }
  };

  // Reached without a profile (bank/department/role) in the URL — e.g.
  // a direct link or a "Démarrer une évaluation" button that doesn't go
  // through the landing page's form. Bounce back now rather than let the
  // user answer all 32 questions only to fail at submission (bank is
  // required by the backend).
  if (!profileData.bank || profileData.bankId == null) {
    return (
      <div className="min-h-screen flex flex-col font-sans" style={{ background: '#FAFAF8' }}>
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm font-medium text-gray-600 max-w-md">
            Veuillez d'abord renseigner votre profil (établissement, département, rôle) avant de démarrer l'évaluation.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 rounded-xl text-sm font-bold bg-gray-900 text-white hover:bg-black transition-colors"
          >
            Renseigner mon profil
          </button>
        </div>
      </div>
    );
  }

  if (loading || checkingBank) {
    return (
      <div className="min-h-screen flex flex-col font-sans" style={{ background: '#FAFAF8' }}>
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm font-medium">Chargement de l'évaluation…</span>
        </div>
      </div>
    );
  }

  if (loadError || dimensions.length === 0) {
    return (
      <div className="min-h-screen flex flex-col font-sans" style={{ background: '#FAFAF8' }}>
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm font-medium text-gray-600 max-w-md">
            Impossible de charger le questionnaire. Vérifiez que l'API est démarrée, puis réessayez.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 rounded-xl text-sm font-bold bg-gray-900 text-white hover:bg-black transition-colors"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  const currentDimension = dimensions[currentDimensionIndex];
  const currentQuestions = currentDimension.questions;
  const currentAnswers = answers[currentDimension.key] || {};
  const dimAnsweredCount = Object.keys(currentAnswers).length;
  const dimCompleted = dimAnsweredCount === currentQuestions.length;
  const isLastDimension = currentDimensionIndex === dimensions.length - 1;

  return (
    <div className="min-h-screen flex flex-col font-sans" style={{ background: '#FAFAF8' }}>
      {/* Header */}
            <Navbar />

      {/* ── HEADER ───────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50" style={{ boxShadow: '0 1px 12px rgba(0,0,0,0.06)' }}>
        <div className="max-w-[1400px] mx-auto px-8 py-5">

          {/* Top row */}
          <div className="flex items-center justify-between mb-5">
            <button
              onClick={() => navigate('/')}
              className="group flex items-center gap-2.5 text-sm font-semibold text-gray-400 hover:text-gray-900 transition-colors duration-200"
            >
              <div className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center group-hover:border-gray-400 group-hover:bg-gray-50 transition-all">
                <ChevronLeft className="w-4 h-4" />
              </div>
              Quitter l'évaluation
            </button>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Save className="w-3.5 h-3.5" />
                {lastSaved ? `Sauvegardé à ${lastSaved.toLocaleTimeString()}` : 'Sauvegarde automatique'}
              </div>
              <div className="w-px h-4 bg-gray-200" />
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
                <span className="text-gray-900">{answeredTotal}</span>
                <span>/ {totalQuestions} questions</span>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-4 mb-6">
            <span className="text-xs font-semibold text-gray-400 shrink-0 tracking-wide">PROGRESSION</span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${globalProgress}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #FFE600 0%, #f5c800 100%)' }}
              />
            </div>
            <span className="text-xs font-bold text-gray-700 shrink-0">{Math.round(globalProgress)}%</span>
          </div>

          {/* Dimension tabs */}
          <div className="flex gap-2">
            {dimensions.map((dim, index) => {
              const progress = getDimProgress(dim);
              const isActive = index === currentDimensionIndex;
              const isCompleted = progress === 100;
              const isAccessible = index <= currentDimensionIndex || isCompleted;

              return (
                <motion.button
                  key={dim.key}
                  onClick={() => isAccessible && setCurrentDimensionIndex(index)}
                  disabled={!isAccessible}
                  whileHover={isAccessible ? { y: -1 } : {}}
                  className={`flex-1 min-w-0 px-3 py-3.5 rounded-xl border transition-all duration-200 relative overflow-hidden flex flex-col gap-2 text-left ${
                    isActive
                      ? 'border-gray-900 bg-gray-900 text-white shadow-lg'
                      : isCompleted
                      ? 'border-green-200 bg-green-50 text-gray-700 hover:border-green-300 cursor-pointer'
                      : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black tracking-widest" style={{ color: isActive ? '#FFE600' : isCompleted ? '#22c55e' : '#9ca3af' }}>{dim.code}</span>
                    {isCompleted && !isActive && (
                      <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                    {isActive && <Flag className="w-3.5 h-3.5 text-[#FFE600]" />}
                  </div>
                  <span className={`text-[10px] font-bold tracking-wide uppercase truncate ${isActive ? 'text-gray-300' : ''}`}>
                    {dim.short_name}
                  </span>
                  <div className={`h-0.5 w-full rounded-full overflow-hidden ${isActive ? 'bg-white/20' : 'bg-gray-200'}`}>
                    <motion.div
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.4 }}
                      className={`h-full rounded-full ${isActive ? 'bg-[#FFE600]' : 'bg-green-400'}`}
                    />
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── MAIN ─────────────────────────────────────────────────── */}
      <main className="flex-1 py-12 px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentDimension.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.38, ease: 'easeOut' }}
            className="max-w-[780px] mx-auto"
          >
            {/* Dimension heading */}
            <div className="mb-10">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold tracking-widest text-gray-400">
                    DIMENSION {currentDimensionIndex + 1} / {dimensions.length}
                  </span>
                  {dimCompleted && (
                    <motion.span
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full"
                    >
                      <Check className="w-3 h-3" /> Complété
                    </motion.span>
                  )}
                </div>
                <h1 className="text-2xl font-semibold text-gray-900 leading-snug">{currentDimension.name}</h1>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">{currentDimension.description}</p>
              </div>
            </div>

            {/* Questions */}
            <div className="space-y-4">
              {currentQuestions.map((question, qIndex) => {
                const selectedValue = currentAnswers[qIndex];
                const isAnswered = selectedValue !== undefined;
                const selectedOption = likertOptions.find(o => o.value === selectedValue);
                const isJustAnswered = justAnswered === qIndex;

                return (
                  <motion.div
                    key={question.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: qIndex * 0.07, duration: 0.32, ease: 'easeOut' }}
                    className="bg-white rounded-2xl overflow-hidden transition-all duration-300"
                    style={{
                      border: isAnswered
                        ? `1.5px solid ${selectedOption?.color}30`
                        : '1.5px solid #f0f0ee',
                      boxShadow: isJustAnswered
                        ? `0 0 0 3px ${selectedOption?.color}25, 0 4px 20px rgba(0,0,0,0.07)`
                        : isAnswered
                        ? '0 2px 12px rgba(0,0,0,0.05)'
                        : '0 1px 4px rgba(0,0,0,0.04)',
                    }}
                  >
                    {/* Answered accent bar */}
                    {isAnswered && (
                      <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        className="h-0.5 w-full origin-left"
                        style={{ background: selectedOption?.color }}
                      />
                    )}

                    <div className="px-7 pt-6 pb-6">
                      {/* Question text row */}
                      <div className="flex items-start gap-4 mb-6">
                        <motion.div
                          animate={{
                            background: isAnswered ? selectedOption?.color : '#f5f5f3',
                            color: isAnswered ? '#ffffff' : '#9ca3af',
                          }}
                          transition={{ duration: 0.3 }}
                          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                        >
                          {isAnswered
                            ? <Check className="w-4 h-4" />
                            : <span className="text-xs font-black">{qIndex + 1}</span>
                          }
                        </motion.div>
                        <div className="flex-1 pt-0.5">
                          <p className="text-[15px] text-gray-800 leading-relaxed font-medium">
                            {question.text}
                          </p>
                          {question.description && (
                            <p className="text-xs text-gray-400 leading-relaxed mt-1.5">
                              {question.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Likert scale — horizontal pill row */}
                      <div className="flex gap-2">
                        {likertOptions.map((option) => {
                          const isSelected = selectedValue === option.value;
                          return (
                            <motion.button
                              key={option.value}
                              onClick={() => handleAnswer(currentDimension.key, qIndex, option.value)}
                              whileHover={{ y: -3, scale: 1.02 }}
                              whileTap={{ scale: 0.95 }}
                              className="flex-1 flex flex-col items-center gap-2 py-3.5 px-1 rounded-xl border-2 transition-all duration-200 relative overflow-hidden"
                              style={{
                                borderColor: isSelected ? option.color : '#eeeeec',
                                background: isSelected ? option.bg : '#fafaf8',
                              }}
                            >
                              {/* Level dots */}
                              <span
                                className="text-[8px] tracking-tighter leading-none font-black"
                                style={{ color: isSelected ? option.color : '#d1d5db', letterSpacing: '1px' }}
                              >
                                {option.dot}
                              </span>
                              <span
                                className="text-[11px] font-bold leading-tight text-center"
                                style={{ color: isSelected ? option.color : '#6b7280' }}
                              >
                                {option.label}
                              </span>
                              <span
                                className="text-[9px] leading-tight text-center font-medium"
                                style={{ color: isSelected ? option.color + 'bb' : '#9ca3af' }}
                              >
                                {option.sublabel}
                              </span>

                              {isSelected && (
                                <motion.div
                                  layoutId={`check-${qIndex}`}
                                  className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                                  style={{ background: option.color }}
                                >
                                  <Check className="w-2.5 h-2.5 text-white" />
                                </motion.div>
                              )}
                            </motion.button>
                          );
                        })}
                      </div>

                      {/* Feedback strip when answered */}
                      <AnimatePresence>
                        {isAnswered && selectedOption && (
                          <motion.div
                            initial={{ opacity: 0, height: 0, marginTop: 0 }}
                            animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                            exit={{ opacity: 0, height: 0, marginTop: 0 }}
                            className="flex items-center gap-2 text-xs rounded-lg px-3 py-2"
                            style={{ background: selectedOption.bg, color: selectedOption.color }}
                          >
                            <span className="font-black">Niveau {selectedOption.value}/5</span>
                            <span className="opacity-60">·</span>
                            <span className="font-semibold">{selectedOption.label}</span>
                            <span className="opacity-60">—</span>
                            <span>{selectedOption.sublabel}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* ── CTA — dimension completed ── */}
            <AnimatePresence>
              {dimCompleted && (
                <motion.div
                  initial={{ opacity: 0, y: 24, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="mt-8 rounded-2xl overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                  }}
                >
                  <div className="px-8 py-7 flex items-center justify-between gap-6">
                    <div className="flex items-center gap-5">
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                        style={{ background: '#FFE600' }}
                      >
                        {isLastDimension
                          ? <Sparkles className="w-6 h-6 text-black" />
                          : <Check className="w-6 h-6 text-black" />
                        }
                      </div>
                      <div>
                        <p className="font-bold text-white text-base leading-snug">
                          {isLastDimension
                            ? 'Évaluation complète !'
                            : `Dimension « ${currentDimension.short_name} » validée`}
                        </p>
                        <p className="text-sm text-gray-400 mt-0.5">
                          {isLastDimension
                            ? 'Votre profil de maturité data est prêt à être généré.'
                            : `Prochaine étape : ${dimensions[currentDimensionIndex + 1]?.name}`}
                        </p>
                      </div>
                    </div>
                    <motion.button
                      onClick={handleNext}
                      disabled={completing}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.97 }}
                      className="flex items-center gap-2.5 px-7 py-3.5 rounded-xl font-bold text-sm shrink-0 transition-all disabled:opacity-50"
                      style={{ background: '#FFE600', color: '#1a1a1a' }}
                    >
                      {completing ? 'Génération...' : isLastDimension ? 'Voir les résultats' : 'Dimension suivante'}
                      {!completing && (isLastDimension
                        ? <ArrowRight className="w-4 h-4" />
                        : <ChevronRight className="w-4 h-4" />
                      )}
                    </motion.button>
                  </div>

                  {/* Subtle progress dots */}
                  <div className="px-8 pb-5 flex items-center gap-1.5">
                    {dimensions.map((_, i) => (
                      <div
                        key={i}
                        className="h-1 rounded-full transition-all duration-300"
                        style={{
                          width: i === currentDimensionIndex ? 24 : 8,
                          background: i < currentDimensionIndex
                            ? '#22c55e'
                            : i === currentDimensionIndex
                            ? '#FFE600'
                            : '#444',
                        }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Hint when not completed */}
            {!dimCompleted && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-400"
              >
                <div className="flex gap-1">
                  {currentQuestions.map((_, i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full transition-all duration-300"
                      style={{ background: currentAnswers[i] !== undefined ? '#22c55e' : '#e5e7eb' }}
                    />
                  ))}
                </div>
                <span className="font-medium">
                  {dimAnsweredCount}/{currentQuestions.length} réponses
                </span>
              </motion.div>
            )}

            <div className="h-20" />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
