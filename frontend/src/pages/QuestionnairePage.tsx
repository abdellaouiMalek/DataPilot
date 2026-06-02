import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Check, Save, LayoutDashboard, Flag } from 'lucide-react';
import { toast } from 'sonner';

const dimensions = [
  { id: 'gouvernance', name: 'Gouvernance des données', color: '#FFE600' },
  { id: 'qualite', name: 'Qualité des données', color: '#2e2e2e' },
  { id: 'architecture', name: 'Architecture & Infrastructure Data', color: '#6b6b6b' },
  { id: 'usage', name: 'Usage & Analytics', color: '#8b8b8b' },
  { id: 'culture', name: 'Culture Data & Compétences', color: '#a8a8a8' },
  { id: 'strategie', name: 'Stratégie & Vision Data', color: '#c4c4c4' },
];

const questions = {
  gouvernance: [
    'Les responsabilités data sont-elles clairement définies (CDO, data owners) ?',
    'Existe-t-il un cadre de gouvernance formalisé avec politiques et standards ?',
    'La gouvernance des données est-elle alignée avec les réglementations (BCT, BCBS 239) ?',
    'Avez-vous mis en place des KPIs pour piloter la gouvernance des données ?',
  ],
  qualite: [
    'Les données sont-elles complètes et exactes (fiables, sans erreurs) ?',
    'Les données sont-elles cohérentes et sans doublons à travers les systèmes ?',
    'Les données sont-elles à jour et disponibles quand nécessaire ?',
    "Existe-t-il un processus de contrôle et d'amélioration continue de la qualité ?",
  ],
  architecture: [
    'Avez-vous centralisé vos données (Data Lake, DWH, MDM) ?',
    'Les systèmes communiquent-ils de manière fluide via APIs et services ?',
    "Les pipelines de données (ETL/ELT) sont-ils automatisés et industrialisés ?",
    "La sécurité et le contrôle d'accès (RBAC, chiffrement) sont-ils en place ?",
  ],
  usage: [
    'Disposez-vous de tableaux de bord et outils de visualisation (BI) ?',
    "Utilisez-vous des modèles prédictifs et de l'advanced analytics ?",
    'Les données influencent-elles réellement la prise de décision ?',
    "Avez-vous des cas d'usage métiers opérationnels (risque, marketing, finance) ?",
  ],
  culture: [
    'Les collaborateurs comprennent-ils les données et leur importance (data literacy) ?',
    'Existe-t-il des programmes de formation et montée en compétences data ?',
    'Les outils data sont-ils adoptés et utilisés par les équipes ?',
    'Y a-t-il une bonne collaboration entre métiers et IT sur les sujets data ?',
  ],
  strategie: [
    'Avez-vous une vision et roadmap data claire et partagée ?',
    'La stratégie data est-elle alignée avec les objectifs business de la banque ?',
    'Les initiatives data sont-elles priorisées de manière structurée ?',
    "Mesurez-vous le ROI et l'impact business des projets data ?",
  ],
};

const likertOptions = [
  { value: 1, label: 'Pas du tout' },
  { value: 2, label: 'Faiblement' },
  { value: 3, label: 'Partiellement' },
  { value: 4, label: 'Largement' },
  { value: 5, label: 'Totalement' },
];

export function QuestionnairePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const profileData = location.state || {};

  const [currentDimensionIndex, setCurrentDimensionIndex] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Record<number, number>>>({});
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const currentDimension = dimensions[currentDimensionIndex];
  const currentQuestions = questions[currentDimension.id as keyof typeof questions];
  const currentQuestion = currentQuestions[currentQuestionIndex];
  const totalQuestions = Object.values(questions).flat().length;
  const answeredQuestions = Object.values(answers).reduce(
    (acc, dim) => acc + Object.keys(dim).length,
    0
  );
  const progress = (answeredQuestions / totalQuestions) * 100;

  const handleAnswer = (value: number) => {
    setAnswers((prev) => ({
      ...prev,
      [currentDimension.id]: {
        ...(prev[currentDimension.id] || {}),
        [currentQuestionIndex]: value,
      },
    }));
  };

  const goNext = () => {
    if (currentQuestionIndex < currentQuestions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else if (currentDimensionIndex < dimensions.length - 1) {
      setCurrentDimensionIndex(currentDimensionIndex + 1);
      setCurrentQuestionIndex(0);
    }
  };

  const goPrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    } else if (currentDimensionIndex > 0) {
      setCurrentDimensionIndex(currentDimensionIndex - 1);
      const prevDimension = dimensions[currentDimensionIndex - 1];
      setCurrentQuestionIndex(questions[prevDimension.id as keyof typeof questions].length - 1);
    }
  };

  const handleSubmit = () => {
    toast.success('Évaluation terminée !', {
      description: 'Génération de votre profil de maturité en cours...',
      duration: 3000,
    });
    setTimeout(() => {
      navigate('/results', { state: { answers, profile: profileData } });
    }, 800);
  };

  const canGoNext = answers[currentDimension.id]?.[currentQuestionIndex] !== undefined;
  const isLastQuestion =
    currentDimensionIndex === dimensions.length - 1 &&
    currentQuestionIndex === currentQuestions.length - 1;

  useEffect(() => {
    const interval = setInterval(() => {
      setLastSaved(new Date());
      if (Math.random() > 0.8) {
        toast('Progression sauvegardée', {
          description: 'Vos réponses ont été enregistrées localement.',
          icon: <Save className="w-4 h-4" />,
        });
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [answers]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-8 py-5">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navigate('/')}
              className="group flex items-center gap-2 text-sm font-semibold tracking-wide text-gray-500 hover:text-black transition-colors"
            >
              <div className="p-1.5 bg-gray-50 group-hover:bg-gray-100 rounded-sm transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </div>
              QUITTER L'ÉVALUATION
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-100 text-xs font-medium text-gray-500">
              <Save className="w-3.5 h-3.5" />
              {lastSaved ? `Sauvegardé à ${lastSaved.toLocaleTimeString()}` : 'Sauvegarde automatique...'}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold tracking-widest text-gray-600">
              <span>PROGRESSION GLOBALE</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 bg-gray-200 relative overflow-hidden rounded-full">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="absolute inset-y-0 left-0 bg-[#FFE600]"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-8 pb-2 w-full">
            {dimensions.map((dim, index) => {
              const dimAnswers = answers[dim.id] || {};
              const dimQuestions = questions[dim.id as keyof typeof questions];
              const dimProgress = (Object.keys(dimAnswers).length / dimQuestions.length) * 100;
              const isActive = index === currentDimensionIndex;
              const isCompleted = dimProgress === 100;

              return (
                <button
                  key={dim.id}
                  onClick={() => {
                    setCurrentDimensionIndex(index);
                    setCurrentQuestionIndex(0);
                  }}
                  className={`flex-1 min-w-0 px-3 py-4 border transition-all relative overflow-hidden flex flex-col justify-center ${
                    isActive
                      ? 'border-black bg-black text-white shadow-md'
                      : isCompleted
                      ? 'border-gray-200 bg-white text-black hover:border-gray-300'
                      : 'border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3 w-full relative z-10">
                    <span className={`text-[10px] md:text-xs font-bold tracking-wider uppercase truncate pr-2 ${isActive ? 'text-[#FFE600]' : ''}`}>
                      {dim.name}
                    </span>
                    {isCompleted && !isActive && <Check className="w-4 h-4 flex-shrink-0 text-green-600" />}
                    {isActive && <Flag className="w-4 h-4 flex-shrink-0 text-white" />}
                  </div>
                  <div className="h-1 w-full bg-gray-800/20 relative z-10 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${dimProgress}%` }}
                      className={`h-full transition-all duration-300 ${
                        isActive ? 'bg-[#FFE600]' : 'bg-green-500'
                      }`}
                    />
                  </div>
                  {isActive && (
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1000px] w-full mx-auto px-8 py-16 flex flex-col justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${currentDimension.id}-${currentQuestionIndex}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="space-y-12"
          >
            <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
              <div className="text-sm font-bold tracking-widest text-gray-400">
                QUESTION {currentQuestionIndex + 1} DE {currentQuestions.length}
              </div>
              <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
              <div className="text-sm font-bold tracking-widest text-black flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4 text-[#FFE600]" />
                {currentDimension.name.toUpperCase()}
              </div>
            </div>

            <h2 className="text-4xl md:text-5xl font-light leading-tight text-gray-900 tracking-tight max-w-4xl">
              {currentQuestion}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 pt-8">
              {likertOptions.map((option) => {
                const isSelected = answers[currentDimension.id]?.[currentQuestionIndex] === option.value;

                return (
                  <motion.button
                    key={option.value}
                    onClick={() => handleAnswer(option.value)}
                    whileHover={{ y: -4 }}
                    whileTap={{ scale: 0.96 }}
                    className={`flex flex-col items-center justify-center gap-4 px-6 py-10 border transition-all ${
                      isSelected
                        ? 'border-black bg-black text-white shadow-xl'
                        : 'border-gray-200 bg-white hover:border-black/30 hover:shadow-md text-gray-700'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected ? 'border-[#FFE600] bg-[#FFE600]' : 'border-gray-300'
                      }`}
                    >
                      {isSelected && <Check className="w-5 h-5 text-black" />}
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-bold tracking-wider mb-1">{option.label}</div>
                      <div className={`text-xs font-semibold ${isSelected ? 'text-[#FFE600]' : 'text-gray-400'}`}>
                        {option.value} / 5
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="bg-white border-t border-gray-200 sticky bottom-0 z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="max-w-[1400px] mx-auto px-8 py-6 flex items-center justify-between">
          <button
            onClick={goPrevious}
            disabled={currentDimensionIndex === 0 && currentQuestionIndex === 0}
            className="group px-6 py-3 border border-gray-200 text-black font-semibold tracking-wide disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors flex items-center gap-3"
          >
            <ChevronLeft className="w-5 h-5 text-gray-400 group-hover:text-black" />
            PRÉCÉDENT
          </button>

          {isLastQuestion ? (
            <motion.button
              onClick={handleSubmit}
              disabled={!canGoNext}
              whileHover={canGoNext ? { scale: 1.02 } : {}}
              whileTap={canGoNext ? { scale: 0.98 } : {}}
              className={`px-8 py-4 font-bold tracking-widest transition-all flex items-center gap-3 ${
                canGoNext
                  ? 'bg-[#FFE600] hover:bg-[#e6cf00] text-black border border-[#e6cf00] shadow-md'
                  : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
              }`}
            >
              VOIR LES RÉSULTATS
              <ChevronRight className="w-5 h-5" />
            </motion.button>
          ) : (
            <button
              onClick={goNext}
              disabled={!canGoNext}
              className={`px-8 py-4 font-bold tracking-widest transition-all flex items-center gap-3 ${
                canGoNext
                  ? 'bg-black text-white hover:bg-gray-900 shadow-md'
                  : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
              }`}
            >
              SUIVANT
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
