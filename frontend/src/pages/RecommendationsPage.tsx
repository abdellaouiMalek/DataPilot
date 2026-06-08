import { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import eyLogo from '../assets/ey-logo.png';
import { motion } from 'motion/react';
import {
  Zap,
  Building,
  Clock,
  Shield,
  TrendingUp,
  ChevronRight,
  CheckCircle2,
  Circle,
} from 'lucide-react';

const recommendations = [
  {
    id: 1,
    dimension: 'Gouvernance des données',
    title: 'Mettre en place un comité de gouvernance des données',
    description: 'Créer une instance de décision formelle avec des représentants métier et IT, définir les rôles (CDO, data owners).',
    priority: 'quick-win',
    effort: 'Moyen',
    impact: 'Élevé',
    timeline: '2-3 mois',
    businessValue: {
      risk: 'Réduction de 40% des risques de non-conformité BCT',
      time: 'Gain de 15h/semaine sur les arbitrages',
      compliance: 'Alignement BCT, BCBS 239 et réglementations bancaires',
    },
  },
  {
    id: 2,
    dimension: 'Qualité des données',
    title: 'Déployer un outil de data quality monitoring',
    description: "Implémenter une solution automatisée de détection et d'alerte qualité (complétude, exactitude, cohérence).",
    priority: 'quick-win',
    effort: 'Faible',
    impact: 'Élevé',
    timeline: '1-2 mois',
    businessValue: {
      risk: "Détection proactive de 85% des anomalies",
      time: 'Économie de 25h/mois de correction manuelle',
      compliance: 'Traçabilité complète pour les audits BCT',
    },
  },
  {
    id: 3,
    dimension: 'Architecture & Infrastructure Data',
    title: "Moderniser l'infrastructure data (Data Lake / DWH)",
    description: 'Centraliser les données avec Data Lake et entrepôt moderne, automatiser les pipelines ETL/ELT.',
    priority: 'structurant',
    effort: 'Élevé',
    impact: 'Très élevé',
    timeline: '12-18 mois',
    businessValue: {
      risk: 'Résilience et disaster recovery améliorés',
      time: 'Réduction de 60% des temps de traitement',
      compliance: 'Sécurité renforcée (RBAC, chiffrement)',
    },
  },
  {
    id: 4,
    dimension: 'Usage & Analytics',
    title: 'Développer des tableaux de bord BI métiers',
    description: 'Créer des dashboards pour risque, finance, marketing avec outils de visualisation modernes.',
    priority: 'quick-win',
    effort: 'Moyen',
    impact: 'Élevé',
    timeline: '2-3 mois',
    businessValue: {
      risk: 'Meilleure détection des risques en temps réel',
      time: 'Réduction de 40% du temps de reporting',
      compliance: 'Reporting réglementaire automatisé',
    },
  },
  {
    id: 5,
    dimension: 'Culture Data & Compétences',
    title: 'Lancer un programme de Data Literacy',
    description: 'Former les équipes métier et IT à la culture data, adoption des outils analytics.',
    priority: 'quick-win',
    effort: 'Moyen',
    impact: 'Moyen',
    timeline: '3-4 mois',
    businessValue: {
      risk: "Réduction des erreurs d'interprétation",
      time: "Gain de 20% d'autonomie métier",
      compliance: 'Meilleure appropriation des contraintes réglementaires',
    },
  },
  {
    id: 6,
    dimension: 'Stratégie & Vision Data',
    title: 'Établir une roadmap et vision data stratégique',
    description: 'Définir la stratégie data alignée avec les objectifs business, prioriser les initiatives.',
    priority: 'structurant',
    effort: 'Faible',
    impact: 'Très élevé',
    timeline: '1 mois',
    businessValue: {
      risk: 'Cohérence des investissements data',
      time: 'Accélération des décisions stratégiques',
      compliance: 'Alignement avec la stratégie bancaire',
    },
  },
  {
    id: 7,
    dimension: 'Qualité des données',
    title: 'Standardiser les processus de data validation',
    description: 'Créer un framework de règles de validation réutilisables pour garantir la cohérence et unicité.',
    priority: 'structurant',
    effort: 'Moyen',
    impact: 'Élevé',
    timeline: '4-6 mois',
    businessValue: {
      risk: 'Homogénéisation des contrôles qualité',
      time: 'Réduction de 30% du time-to-market',
      compliance: 'Conformité by-design',
    },
  },
  {
    id: 8,
    dimension: 'Usage & Analytics',
    title: "Implémenter des modèles d'advanced analytics",
    description: 'Déployer des modèles prédictifs pour le risque crédit, détection de fraude, scoring client.',
    priority: 'structurant',
    effort: 'Élevé',
    impact: 'Très élevé',
    timeline: '8-12 mois',
    businessValue: {
      risk: 'Amélioration de 30% de la détection de fraude',
      time: "Automatisation de 50% du scoring",
      compliance: 'Modèles conformes aux exigences BCT',
    },
  },
];

const generateSimulatedRecommendations = (currentScores: Record<string, number>, targetScores: Record<string, number>) => {
  const generated: any[] = [];
  let id = 100;

  const dimensionData = [
    {
      id: 'gouvernance',
      dimension: 'Gouvernance des données',
      structurant: {
        title: "Structurer l'organisation Data par l'objectif",
        description: "Mettre en place un modèle opérationnel cible pour supporter l'ambition simulée de gouvernance.",
        timeline: '6-9 mois', effort: 'Élevé', impact: 'Très élevé',
        businessValue: { risk: "Responsabilités clarifiées", time: "Prise de décision accélérée", compliance: "Conformité garantie" }
      },
      quickWin: {
        title: 'Nommer des Data Owners pilotes',
        description: 'Désigner immédiatement des responsables sur les domaines de données prioritaires.',
        timeline: '1-2 mois', effort: 'Moyen', impact: 'Élevé',
        businessValue: { risk: "Identification des anomalies", time: "Résolution plus rapide", compliance: "Début de traçabilité" }
      }
    },
    {
      id: 'qualite',
      dimension: 'Qualité des données',
      structurant: {
        title: 'Industrialiser la gestion de la qualité',
        description: "Déployer une plateforme d'entreprise pour le monitoring continu de la qualité des données.",
        timeline: '9-12 mois', effort: 'Élevé', impact: 'Très élevé',
        businessValue: { risk: "Fiabilité des reportings", time: "Baisse des retraitements", compliance: "Auditabilité complète" }
      },
      quickWin: {
        title: 'Corriger les anomalies critiques',
        description: "Lancer une campagne coup de poing sur les 20% de données causant 80% des problèmes.",
        timeline: '2-3 mois', effort: 'Faible', impact: 'Élevé',
        businessValue: { risk: "Baisse immédiate du risque", time: "Gains de productivité", compliance: "Conformité ciblée" }
      }
    },
    {
      id: 'architecture',
      dimension: 'Architecture & Infrastructure Data',
      structurant: {
        title: 'Refonte vers une architecture Cloud Data',
        description: "Migration vers un socle technologique évolutif permettant de soutenir l'échelle visée.",
        timeline: '12-18 mois', effort: 'Élevé', impact: 'Très élevé',
        businessValue: { risk: "Haute disponibilité", time: "Time-to-market divisé par 3", compliance: "Sécurité by-design" }
      },
      quickWin: {
        title: 'Optimiser les flux existants',
        description: "Identifier et corriger les goulots d'étranglement sur l'infrastructure actuelle.",
        timeline: '1-3 mois', effort: 'Moyen', impact: 'Moyen',
        businessValue: { risk: "Réduction des incidents", time: "Temps de calcul réduits", compliance: "Amélioration SLA" }
      }
    },
    {
      id: 'usage',
      dimension: 'Usage & Analytics',
      structurant: {
        title: "Déploiement de l'IA et Machine Learning",
        description: 'Intégration de modèles prédictifs dans les processus métiers cœur de la banque.',
        timeline: '9-12 mois', effort: 'Élevé', impact: 'Très élevé',
        businessValue: { risk: "Détection avancée des fraudes", time: "Processus automatisés", compliance: "Modèles explicables" }
      },
      quickWin: {
        title: 'Démocratiser la BI en libre-service',
        description: 'Mettre à disposition des dashboards interactifs pour les utilisateurs métiers clés.',
        timeline: '2-4 mois', effort: 'Moyen', impact: 'Élevé',
        businessValue: { risk: "Une seule source de vérité", time: "Reporting instantané", compliance: "Accessibilité contrôlée" }
      }
    },
    {
      id: 'culture',
      dimension: 'Culture Data & Compétences',
      structurant: {
        title: 'Programme de transformation culturelle',
        description: "Plan global d'acculturation et de montée en compétences (upskilling/reskilling).",
        timeline: '12+ mois', effort: 'Élevé', impact: 'Très élevé',
        businessValue: { risk: "Culture du risque data", time: "Autonomie des équipes", compliance: "Sensibilisation générale" }
      },
      quickWin: {
        title: 'Lancer une communauté Data',
        description: "Créer un réseau d'ambassadeurs pour partager les bonnes pratiques et succès.",
        timeline: '1-2 mois', effort: 'Faible', impact: 'Moyen',
        businessValue: { risk: "Partage des standards", time: "Entraide collaborative", compliance: "Diffusion des règles" }
      }
    },
    {
      id: 'strategie',
      dimension: 'Stratégie & Vision Data',
      structurant: {
        title: 'Alignement stratégique global',
        description: "Intégration native de la data dans le plan stratégique de développement de la banque.",
        timeline: '6-9 mois', effort: 'Élevé', impact: 'Très élevé',
        businessValue: { risk: "Cohérence des investissements", time: "Priorisation claire", compliance: "Vision réglementaire long-terme" }
      },
      quickWin: {
        title: "Définir les cas d'usage prioritaires",
        description: "Identifier 3 à 5 initiatives data générant un ROI à très court terme.",
        timeline: '1 mois', effort: 'Faible', impact: 'Élevé',
        businessValue: { risk: "Validation par la preuve", time: "Succès rapide", compliance: "Focus métier" }
      }
    }
  ];

  Object.keys(targetScores).forEach(key => {
    const delta = targetScores[key] - (currentScores[key] || 0);
    const dimData = dimensionData.find(d => d.id === key);

    if (delta > 0 && dimData) {
      if (delta >= 1.0) {
        generated.push({
          id: id++,
          dimension: dimData.dimension,
          title: `[Objectif +${delta.toFixed(1)}] ${dimData.structurant.title}`,
          description: dimData.structurant.description,
          priority: 'structurant',
          effort: dimData.structurant.effort,
          impact: dimData.structurant.impact,
          timeline: dimData.structurant.timeline,
          businessValue: dimData.structurant.businessValue
        });
      } else {
        generated.push({
          id: id++,
          dimension: dimData.dimension,
          title: `[Objectif +${delta.toFixed(1)}] ${dimData.quickWin.title}`,
          description: dimData.quickWin.description,
          priority: 'quick-win',
          effort: dimData.quickWin.effort,
          impact: dimData.quickWin.impact,
          timeline: dimData.quickWin.timeline,
          businessValue: dimData.quickWin.businessValue
        });
      }
    }
  });

  if (generated.length === 0) {
    generated.push({
      id: 999,
      dimension: "Maturité Globale",
      title: "Maintenir l'existant",
      description: "Vous n'avez simulé aucune amélioration. Continuez de monitorer les systèmes.",
      priority: 'quick-win',
      effort: 'Faible',
      impact: 'Moyen',
      timeline: 'Continu',
      businessValue: { risk: "Maintien des standards", time: "Processus habituels", compliance: "Conformité de base" }
    });
  }

  return generated;
};

export function RecommendationsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedPriority, setSelectedPriority] = useState<'all' | 'quick-win' | 'structurant'>('all');
  const [completedIds, setCompletedIds] = useState<number[]>([]);

  const isSimulation = location.state?.isSimulation;
  const currentScores = location.state?.scores || {};
  const targetScores = location.state?.targetScores || {};

  const activeRecommendations = useMemo(() => {
    return isSimulation
      ? generateSimulatedRecommendations(currentScores, targetScores)
      : recommendations;
  }, [isSimulation, currentScores, targetScores]);

  const filteredRecommendations =
    selectedPriority === 'all'
      ? activeRecommendations
      : activeRecommendations.filter((r) => r.priority === selectedPriority);

  const quickWins = activeRecommendations.filter((r) => r.priority === 'quick-win');
  const structurants = activeRecommendations.filter((r) => r.priority === 'structurant');

  const pageSubtitle = isSimulation ? "Généré sur mesure selon vos objectifs de simulation." : "Plan d'action priorisé";
  const pageDescription = isSimulation
    ? `Ces ${activeRecommendations.length} recommandations sont générées dynamiquement pour vous aider à atteindre la cible que vous venez de simuler.`
    : `${activeRecommendations.length} recommandations priorisées pour accélérer votre transformation et générer de la valeur business mesurable.`;

  const toggleComplete = (id: number) => {
    setCompletedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-black/5">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={eyLogo} alt="EY" className="w-12 h-12 object-contain" />
              <div>
                <div className="text-sm tracking-wide text-black/60">RECOMMANDATIONS</div>
                <div className="text-xs text-black/40">{pageSubtitle}</div>
              </div>
            </div>
            <button
              onClick={() => isSimulation ? navigate('/simulation', { state: { scores: currentScores } }) : navigate('/dashboard')}
              className="px-4 py-2 border border-black/10 text-black hover:bg-black/5 transition-colors"
            >
              {isSimulation ? "Retour au simulateur" : "Retour au dashboard"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <div className="grid grid-cols-12 gap-16">
            <div className="col-span-7 space-y-6">
              <h1 className="text-6xl leading-tight text-black">
                Plan d'action
                <br />
                <span className="relative inline-block">
                  {isSimulation ? 'simulé' : 'stratégique'}
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 0.8, delay: 0.5 }}
                    className="absolute -bottom-2 left-0 h-4 bg-[#FFE600] -z-10"
                  />
                </span>
              </h1>
              <p className="text-lg text-black/70 max-w-xl">
                {pageDescription}
              </p>
            </div>

            <div className="col-span-5 grid grid-cols-2 gap-4">
              <div className="border border-black/5 bg-[#fafafa] p-6 space-y-3">
                <Zap className="w-8 h-8 text-[#FFE600]" />
                <div className="text-3xl">{quickWins.length}</div>
                <div className="text-sm text-black/60">Quick Wins</div>
              </div>
              <div className="border border-black/5 bg-[#fafafa] p-6 space-y-3">
                <Building className="w-8 h-8 text-black" />
                <div className="text-3xl">{structurants.length}</div>
                <div className="text-sm text-black/60">Projets Structurants</div>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="mb-12 flex gap-3">
          <button
            onClick={() => setSelectedPriority('all')}
            className={`px-6 py-2 border transition-all ${
              selectedPriority === 'all'
                ? 'border-black bg-black text-white'
                : 'border-black/10 bg-white text-black hover:border-black/30'
            }`}
          >
            Toutes ({activeRecommendations.length})
          </button>
          <button
            onClick={() => setSelectedPriority('quick-win')}
            className={`px-6 py-2 border transition-all flex items-center gap-2 ${
              selectedPriority === 'quick-win'
                ? 'border-[#FFE600] bg-[#FFE600] text-black'
                : 'border-black/10 bg-white text-black hover:border-black/30'
            }`}
          >
            <Zap className="w-4 h-4" />
            Quick Wins ({quickWins.length})
          </button>
          <button
            onClick={() => setSelectedPriority('structurant')}
            className={`px-6 py-2 border transition-all flex items-center gap-2 ${
              selectedPriority === 'structurant'
                ? 'border-black bg-black text-white'
                : 'border-black/10 bg-white text-black hover:border-black/30'
            }`}
          >
            <Building className="w-4 h-4" />
            Structurants ({structurants.length})
          </button>
        </div>

        <div className="space-y-6">
          {filteredRecommendations.map((rec, index) => {
            const isCompleted = completedIds.includes(rec.id);

            return (
              <motion.div
                key={rec.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className={`border transition-all ${
                  isCompleted
                    ? 'border-black/10 bg-black/5'
                    : rec.priority === 'quick-win'
                    ? 'border-[#FFE600]/30 bg-[#FFE600]/5 hover:border-[#FFE600]'
                    : 'border-black/10 bg-white hover:border-black/30'
                }`}
              >
                <div className="p-8">
                  <div className="flex gap-8">
                    <button
                      onClick={() => toggleComplete(rec.id)}
                      className="flex-shrink-0 w-6 h-6 mt-1"
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-6 h-6 text-[#2e8b57]" />
                      ) : (
                        <Circle className="w-6 h-6 text-black/20 hover:text-black/60 transition-colors" />
                      )}
                    </button>

                    <div className="flex-1 space-y-6">
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="inline-block border border-black/10 px-3 py-1">
                            <span className="text-xs tracking-wider text-black/60">
                              {rec.dimension.toUpperCase()}
                            </span>
                          </div>
                          {rec.priority === 'quick-win' && (
                            <div className="flex items-center gap-1 bg-[#FFE600] px-3 py-1">
                              <Zap className="w-3 h-3" />
                              <span className="text-xs tracking-wider">QUICK WIN</span>
                            </div>
                          )}
                        </div>
                        <h3 className={`text-2xl ${isCompleted ? 'line-through text-black/40' : 'text-black'}`}>
                          {rec.title}
                        </h3>
                        <p className={`text-black/70 ${isCompleted ? 'opacity-50' : ''}`}>
                          {rec.description}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="w-4 h-4 text-black/40" />
                          <span className="text-black/60">Durée :</span>
                          <span>{rec.timeline}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <TrendingUp className="w-4 h-4 text-black/40" />
                          <span className="text-black/60">Impact :</span>
                          <span>{rec.impact}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Building className="w-4 h-4 text-black/40" />
                          <span className="text-black/60">Effort :</span>
                          <span>{rec.effort}</span>
                        </div>
                      </div>

                      <div className="border-t border-black/5 pt-6 space-y-3">
                        <div className="text-sm tracking-wider text-black/60">VALEUR BUSINESS</div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="flex items-start gap-2">
                            <Shield className="w-4 h-4 text-[#FFE600] flex-shrink-0 mt-1" />
                            <div className="text-sm text-black/70">{rec.businessValue.risk}</div>
                          </div>
                          <div className="flex items-start gap-2">
                            <Clock className="w-4 h-4 text-[#FFE600] flex-shrink-0 mt-1" />
                            <div className="text-sm text-black/70">{rec.businessValue.time}</div>
                          </div>
                          <div className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 text-[#FFE600] flex-shrink-0 mt-1" />
                            <div className="text-sm text-black/70">{rec.businessValue.compliance}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <button className="flex-shrink-0 px-6 py-3 border border-black/10 hover:border-black hover:bg-black hover:text-white transition-all self-start h-fit">
                      Détails
                      <ChevronRight className="w-4 h-4 inline ml-2" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-20 border-t border-black/5 pt-16"
        >
          <div className="space-y-8">
            <h2 className="text-3xl">Vue roadmap</h2>
            <div className="relative">
              <div className="absolute top-6 left-0 right-0 h-0.5 bg-black/10" />
              <div className="grid grid-cols-4 gap-4 relative">
                {['Q2 2026', 'Q3 2026', 'Q4 2026', 'Q1 2027'].map((quarter, index) => (
                  <div key={quarter} className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-[#FFE600] rounded-full" />
                      <span className="text-sm tracking-wide text-black/60">{quarter}</span>
                    </div>
                    <div className="space-y-2 pl-6">
                      {filteredRecommendations
                        .filter((_, i) => i % 4 === index)
                        .map((rec) => (
                          <div key={rec.id} className="text-sm text-black/70 border-l-2 border-black/10 pl-3 py-1">
                            {rec.title.substring(0, 40)}...
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-16 border border-black/5 bg-[#fafafa] p-10"
        >
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h3 className="text-2xl">Prêt à modéliser l'impact ?</h3>
              <p className="text-black/70">
                Simulez les gains potentiels de ces recommandations sur vos métriques business.
              </p>
            </div>
            <button
              onClick={() => navigate('/simulation')}
              className="px-8 py-4 bg-[#FFE600] hover:bg-[#f5dc00] text-black transition-colors flex items-center gap-3"
            >
              Lancer une simulation
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
