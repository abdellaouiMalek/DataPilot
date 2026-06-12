import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Check, LayoutDashboard, Flag } from 'lucide-react';
import { toast } from 'sonner';
import { Navbar } from '../components/Navbar';

const dimensions = [
  { id: 'gouvernance', name: 'Gouvernance des données', color: '#FFE600' },
  { id: 'qualite', name: 'Qualité des données', color: '#2e2e2e' },
  { id: 'architecture', name: 'Architecture & Infra Data', color: '#6b6b6b' },
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

  const currentDimension = dimensions[currentDimensionIndex];
  const currentQuestions = questions[currentDimension.id as keyof typeof questions];
  const currentQuestion = currentQuestions[currentQuestionIndex];

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

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col font-sans overflow-x-hidden">
      <Navbar />
      {/* Section Navigation */}
      <header className="bg-white border-b border-gray-200 z-50 flex-shrink-0 sticky top-0">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-3.5">
          {/* Dimensions Navigation - Horizontal Scrollable on Mobile */}
          <div className="flex gap-2 w-full overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 scroll-smooth">
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
                  className={`flex-shrink-0 sm:flex-1 min-w-[140px] sm:min-w-0 px-3 py-2 border transition-all relative overflow-hidden flex flex-col justify-center ${
                    isActive
                      ? 'border-black bg-black text-white shadow-md'
                      : isCompleted
                      ? 'border-gray-200 bg-white text-black hover:border-gray-300'
                      : 'border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5 w-full relative z-10 gap-1">
                    <span className={`text-[10px] font-bold tracking-wider uppercase truncate ${isActive ? 'text-[#FFE600]' : ''}`}>
                      {dim.name}
                    </span>
                    {isCompleted && !isActive && <Check className="w-3 h-3 flex-shrink-0 text-green-600" />}
                    {isActive && <Flag className="w-3 h-3 flex-shrink-0 text-white" />}
                  </div>
                  <div className="h-0.5 w-full bg-gray-800/20 relative z-10 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${dimProgress}%` }}
                      className={`h-full transition-all duration-300 ${
                        isActive ? 'bg-[#FFE600]' : 'bg-green-500'
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center py-6 sm:py-12 overflow-y-auto">
        <div className="max-w-[900px] w-full mx-auto px-4 sm:px-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${currentDimension.id}-${currentQuestionIndex}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="space-y-6 sm:space-y-10"
            >
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-2 px-2.5 py-1 bg-gray-100 rounded-sm max-w-[70%] sm:max-w-none">
                  <LayoutDashboard className="w-3.5 h-3.5 text-[#FFE600] flex-shrink-0" />
                  <span className="text-[10px] sm:text-xs font-bold tracking-widest text-gray-500 uppercase truncate">
                    {currentDimension.name}
                  </span>
                </div>
                <div className="w-1 h-1 rounded-full bg-gray-300 flex-shrink-0" />
                <div className="text-[10px] sm:text-xs font-bold tracking-widest text-gray-400 flex-shrink-0">
                  {currentQuestionIndex + 1} / {currentQuestions.length}
                </div>
              </div>

              <div className="space-y-2">
                <div className="w-8 h-0.5 bg-[#FFE600]" />
                <h2 className="text-xl sm:text-2xl md:text-[2.6rem] font-light leading-snug text-gray-900 tracking-tight">
                  {currentQuestion}
                </h2>
              </div>

              {/* Likert Options Grid/List */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2 sm:gap-3">
                {likertOptions.map((option) => {
                  const isSelected = answers[currentDimension.id]?.[currentQuestionIndex] === option.value;

                  return (
                    <motion.button
                      key={option.value}
                      onClick={() => handleAnswer(option.value)}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      className={`flex flex-row md:flex-col items-center justify-start md:justify-center gap-4 px-4 py-4 md:py-8 border-2 transition-all w-full text-left md:text-center ${
                        isSelected
                          ? 'border-black bg-black text-white'
                          : 'border-gray-200 bg-white hover:border-gray-400 text-gray-700'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 md:w-10 md:h-10 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                          isSelected ? 'border-[#FFE600] bg-[#FFE600]' : 'border-gray-300'
                        }`}
                      >
                        {isSelected
                          ? <Check className="w-4 h-4 md:w-5 md:h-5 text-black" />
                          : <span className="text-xs md:text-sm font-bold text-gray-400">{option.value}</span>
                        }
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold tracking-wide truncate md:whitespace-normal">
                          {option.label}
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Footer Navigation */}
      <footer className="bg-white border-t border-gray-200 z-50 flex-shrink-0 sticky bottom-0">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-3 flex items-center justify-between gap-4">
          <button
            onClick={goPrevious}
            disabled={currentDimensionIndex === 0 && currentQuestionIndex === 0}
            className="group px-3 sm:px-4 py-2 border border-gray-200 text-black text-xs sm:text-sm font-semibold tracking-wide disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <ChevronLeft className="w-4 h-4 text-gray-400 group-hover:text-black" />
            PRÉCÉDENT
          </button>

          {isLastQuestion ? (
            <motion.button
              onClick={handleSubmit}
              disabled={!canGoNext}
              whileHover={canGoNext ? { scale: 1.02 } : {}}
              whileTap={canGoNext ? { scale: 0.98 } : {}}
              className={`px-4 sm:px-6 py-2 text-xs sm:text-sm font-bold tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${
                canGoNext
                  ? 'bg-[#FFE600] hover:bg-[#e6cf00] text-black border border-[#e6cf00] shadow-md'
                  : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
              }`}
            >
              FINIR
              <ChevronRight className="w-4 h-4" />
            </motion.button>
          ) : (
            <button
              onClick={goNext}
              disabled={!canGoNext}
              className={`px-4 sm:px-6 py-2 text-xs sm:text-sm font-bold tracking-widest transition-all flex items-center gap-2 ${
                canGoNext
                  ? 'bg-black text-white hover:bg-gray-900 shadow-md'
                  : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
              }`}
            >
              SUIVANT
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}