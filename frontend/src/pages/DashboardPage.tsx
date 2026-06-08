import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Filter, TrendingUp, Users, Building2, Calendar, ChevronDown, ChevronRight, Download, BarChart3 } from 'lucide-react';
import Select from 'react-select';
import type { StylesConfig } from 'react-select';
import eyLogo from '../assets/ey-logo.png';
import { toast } from 'sonner';

const mockHistoricalData = [
  { month: 'Jan', gouvernance: 2.8, qualite: 3.2, architecture: 2.5, usage: 3.0, culture: 2.9, strategie: 3.1 },
  { month: 'Fév', gouvernance: 3.0, qualite: 3.4, architecture: 2.7, usage: 3.1, culture: 3.0, strategie: 3.2 },
  { month: 'Mar', gouvernance: 3.2, qualite: 3.5, architecture: 2.9, usage: 3.3, culture: 3.2, strategie: 3.4 },
  { month: 'Avr', gouvernance: 3.5, qualite: 3.8, architecture: 3.2, usage: 3.5, culture: 3.4, strategie: 3.6 },
  { month: 'Mai', gouvernance: 3.7, qualite: 4.0, architecture: 3.4, usage: 3.7, culture: 3.6, strategie: 3.8 },
  { month: 'Juin', gouvernance: 3.9, qualite: 4.1, architecture: 3.6, usage: 3.9, culture: 3.8, strategie: 4.0 },
];

const mockEntityComparison = [
  { entity: 'BIAT', score: 4.2 },
  { entity: 'Attijari Bank', score: 4.0 },
  { entity: 'Amen Bank', score: 3.8 },
  { entity: 'UIB', score: 3.5 },
  { entity: 'STB', score: 3.2 },
  { entity: 'BNA', score: 3.0 },
];

const kpis = [
  { label: 'Score moyen global', value: '3.8', change: '+12%', trend: 'up' },
  { label: 'Évaluations complétées', value: '47', change: '+8', trend: 'up' },
  { label: 'Utilisateurs actifs', value: '156', change: '+23', trend: 'up' },
  { label: 'Taux de progression', value: '15%', change: '+3%', trend: 'up' },
];

const selectStyles: StylesConfig<any, false> = {
  control: (base, state) => ({
    ...base,
    borderRadius: 0,
    minHeight: '44px',
    boxShadow: 'none',
    borderColor: state.isFocused ? '#000' : '#e5e7eb',
    '&:hover': {
      borderColor: state.isFocused ? '#000' : '#d1d5db'
    },
    backgroundColor: '#fff',
    cursor: 'pointer'
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected ? '#FFE600' : state.isFocused ? '#f3f4f6' : 'white',
    color: state.isSelected ? 'black' : '#374151',
    fontWeight: state.isSelected ? 600 : 400,
    '&:active': { backgroundColor: '#FFE600' },
    cursor: 'pointer',
    padding: '10px 14px',
    fontSize: '14px'
  }),
  singleValue: (base) => ({
    ...base,
    color: '#111827',
    fontWeight: 500,
    fontSize: '14px'
  }),
  menu: (base) => ({
    ...base,
    borderRadius: 0,
    marginTop: '4px',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e5e7eb',
    zIndex: 50
  })
};

export function DashboardPage() {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState('6M');
  const [selectedEntity, setSelectedEntity] = useState('Tous');
  const [selectedDept, setSelectedDept] = useState('Tous les départements');
  const [showFilters, setShowFilters] = useState(false);

  const periods = ['1M', '3M', '6M', '1A', 'Tout'];
  const entities = ['Tous', 'BIAT', 'Attijari Bank', 'Amen Bank', 'UIB', 'STB', 'BNA', 'Banque de Tunisie'];
  const depts = ["Tous les départements", "Systèmes d'Information", "Gestion des Risques", "Conformité & Audit", "Opérations Bancaires", "Finance & Comptabilité"];

  const entityOptions = entities.map(e => ({ value: e, label: e }));
  const deptOptions = depts.map(d => ({ value: d, label: d }));

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src={eyLogo} alt="EY" className="w-14 h-14 object-contain" />
              <div className="flex flex-col">
                <span className="text-sm font-bold tracking-widest text-gray-900">MANAGEMENT DASHBOARD</span>
                <span className="text-xs text-gray-500 tracking-wider">Vue stratégique consolidée</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-5 py-2.5 border transition-all flex items-center gap-2 text-sm font-bold tracking-wide ${
                  showFilters
                    ? 'border-black bg-black text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Filter className="w-4 h-4" />
                FILTRES
                <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-5 py-2.5 bg-[#FFE600] text-black font-bold tracking-wide hover:bg-[#e6cf00] border border-[#e6cf00] transition-colors shadow-sm"
              >
                NOUVELLE ÉVALUATION
              </button>
            </div>
          </div>

          <motion.div
            initial={false}
            animate={{ height: showFilters ? 'auto' : 0, opacity: showFilters ? 1 : 0 }}
            className="overflow-hidden"
          >
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-3">
                  <label className="text-xs font-bold tracking-widest text-gray-500 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#FFE600]" />
                    PÉRIODE D'ANALYSE
                  </label>
                  <div className="flex gap-2">
                    {periods.map((period) => (
                      <button
                        key={period}
                        onClick={() => setSelectedPeriod(period)}
                        className={`flex-1 px-3 py-2.5 border text-sm font-semibold transition-all ${
                          selectedPeriod === period
                            ? 'border-black bg-black text-white shadow-md'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {period}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-bold tracking-widest text-gray-500 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#FFE600]" />
                    ÉTABLISSEMENT
                  </label>
                  <div className="relative z-50">
                    <Select
                      options={entityOptions}
                      value={entityOptions.find(o => o.value === selectedEntity) || null}
                      onChange={(option) => setSelectedEntity(option?.value || 'Tous')}
                      styles={selectStyles}
                      isSearchable
                      components={{ IndicatorSeparator: () => null }}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-bold tracking-widest text-gray-500 flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#FFE600]" />
                    DÉPARTEMENT
                  </label>
                  <div className="relative z-40">
                    <Select
                      options={deptOptions}
                      value={deptOptions.find(o => o.value === selectedDept) || null}
                      onChange={(option) => setSelectedDept(option?.value || 'Tous les départements')}
                      styles={selectStyles}
                      isSearchable
                      components={{ IndicatorSeparator: () => null }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12"
        >
          {kpis.map((kpi, index) => (
            <div
              key={index}
              className="bg-white border border-gray-200 p-8 hover:shadow-lg transition-all hover:-translate-y-1 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-1 h-full bg-[#FFE600]" />
              <div className="space-y-4">
                <div className="text-xs font-bold tracking-widest text-gray-400 uppercase">{kpi.label}</div>
                <div className="flex items-baseline gap-4">
                  <div className="text-5xl font-light text-gray-900 tracking-tight">
                    {kpi.value}
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 text-green-700 text-sm font-bold rounded-sm">
                    <TrendingUp className="w-3.5 h-3.5" />
                    {kpi.change}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-12"
        >
          <div className="bg-white border border-gray-200 p-10 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 pb-6 border-b border-gray-100">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gray-50 rounded-sm">
                  <BarChart3 className="w-6 h-6 text-gray-700" />
                </div>
                <div>
                  <h3 className="text-2xl font-light text-gray-900 tracking-tight mb-1">
                    Évolution de la maturité
                  </h3>
                  <p className="text-sm font-medium text-gray-500">Suivi historique des scores par dimension</p>
                </div>
              </div>
              <div className="mt-4 md:mt-0 flex items-center gap-3">
                <div className="text-sm font-bold tracking-widest text-gray-400">DERNIERS 6 MOIS</div>
                <button
                  onClick={() => toast.success('Export des données', { description: 'Le fichier CSV a été téléchargé avec succès.' })}
                  className="p-2 bg-gray-50 text-gray-500 hover:text-black hover:bg-gray-100 transition-colors border border-gray-200"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mockHistoricalData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 600 }}
                    axisLine={{ stroke: '#E5E7EB', strokeWidth: 2 }}
                    tickLine={false}
                    dy={10}
                  />
                  <YAxis
                    domain={[0, 5]}
                    tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    dx={-10}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1F2937',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#F9FAFB',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    }}
                    itemStyle={{ color: '#F9FAFB', fontWeight: 500 }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '30px' }} iconType="circle" iconSize={8} />
                  <Line type="monotone" dataKey="gouvernance" stroke="#FFE600" strokeWidth={3} dot={{ fill: '#FFE600', r: 4, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} name="Gouvernance" />
                  <Line type="monotone" dataKey="qualite" stroke="#111827" strokeWidth={3} dot={{ fill: '#111827', r: 4, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} name="Qualité" />
                  <Line type="monotone" dataKey="architecture" stroke="#6B7280" strokeWidth={3} dot={{ fill: '#6B7280', r: 4, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} name="Architecture" />
                  <Line type="monotone" dataKey="usage" stroke="#9CA3AF" strokeWidth={3} dot={{ fill: '#9CA3AF', r: 4, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} name="Usage" />
                  <Line type="monotone" dataKey="culture" stroke="#D1D5DB" strokeWidth={3} dot={{ fill: '#D1D5DB', r: 4, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} name="Culture" />
                  <Line type="monotone" dataKey="strategie" stroke="#4B5563" strokeWidth={3} dot={{ fill: '#4B5563', r: 4, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} name="Stratégie" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-8"
        >
          <div className="lg:col-span-8">
            <div className="bg-white border border-gray-200 p-10 shadow-sm h-full">
              <div className="mb-10 pb-6 border-b border-gray-100">
                <h3 className="text-2xl font-light text-gray-900 tracking-tight mb-1">
                  Comparaison inter-établissements
                </h3>
                <p className="text-sm font-medium text-gray-500">Benchmark des scores globaux de maturité</p>
              </div>

              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mockEntityComparison} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                    <XAxis type="number" domain={[0, 5]} tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="entity"
                      tick={{ fill: '#111827', fontSize: 13, fontWeight: 600 }}
                      width={180}
                      axisLine={{ stroke: '#E5E7EB', strokeWidth: 2 }}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: '#F3F4F6' }}
                      contentStyle={{
                        backgroundColor: '#1F2937',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#F9FAFB',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      }}
                    />
                    <Bar dataKey="score" fill="#111827" radius={[0, 4, 4, 0]} barSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-8">
            <div className="bg-gray-900 text-white p-8 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFE600]/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />

              <div className="relative z-10 space-y-8">
                <div className="flex items-center gap-3 border-b border-gray-700 pb-4">
                  <TrendingUp className="w-5 h-5 text-[#FFE600]" />
                  <div className="text-xs font-bold tracking-widest text-gray-400">TOP PERFORMERS</div>
                </div>

                <div className="space-y-6">
                  {mockEntityComparison
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 3)
                    .map((entity, index) => (
                      <div key={entity.entity} className="flex items-center gap-5">
                        <div
                          className={`text-xl font-bold w-12 h-12 flex items-center justify-center shadow-md ${
                            index === 0 ? 'bg-[#FFE600] text-black' : 'bg-gray-800 text-white border border-gray-700'
                          }`}
                        >
                          0{index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="text-base font-semibold tracking-tight">{entity.entity}</div>
                          <div className="text-sm text-[#FFE600] font-bold">{entity.score.toFixed(1)} / 5.0</div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 p-8 shadow-sm">
              <div className="space-y-6">
                <div className="text-xs font-bold tracking-widest text-gray-400 uppercase border-b border-gray-100 pb-4">
                  ACTIONS RAPIDES
                </div>
                <div className="space-y-3">
                  <button
                    onClick={() => navigate('/recommendations')}
                    className="w-full px-5 py-4 border border-gray-200 text-left hover:border-black hover:shadow-md transition-all text-sm font-bold text-gray-700 hover:text-black flex items-center justify-between group"
                  >
                    Voir les recommandations
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-black" />
                  </button>
                  <button
                    onClick={() => navigate('/simulation')}
                    className="w-full px-5 py-4 border border-gray-200 text-left hover:border-black hover:shadow-md transition-all text-sm font-bold text-gray-700 hover:text-black flex items-center justify-between group"
                  >
                    Lancer une simulation
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-black" />
                  </button>
                  <button
                    onClick={() => navigate('/results')}
                    className="w-full px-5 py-4 border border-gray-200 text-left hover:border-black hover:shadow-md transition-all text-sm font-bold text-gray-700 hover:text-black flex items-center justify-between group"
                  >
                    Exporter les rapports
                    <Download className="w-4 h-4 text-gray-400 group-hover:text-black" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
