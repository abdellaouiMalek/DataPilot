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
import { TrendingUp, ChevronRight, Download, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { Navbar } from '../components/Navbar';

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

export function DashboardPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 font-sans antialiased overflow-x-hidden">
      <Navbar />

      {/* Main Grid */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-8 py-6 sm:py-12 space-y-6 sm:space-y-12">
        {/* KPIs Cards */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
        >
          {kpis.map((kpi, index) => (
            <div
              key={index}
              className="bg-white border border-gray-200 p-5 sm:p-8 hover:shadow-lg transition-all relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-1 h-full bg-[#FFE600]" />
              <div className="space-y-3 sm:space-y-4">
                <div className="text-[10px] sm:text-xs font-bold tracking-widest text-gray-400 uppercase truncate">{kpi.label}</div>
                <div className="flex items-baseline justify-between sm:justify-start sm:gap-4">
                  <div className="text-3xl sm:text-5xl font-light text-gray-900 tracking-tight">
                    {kpi.value}
                  </div>
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs sm:text-sm font-bold rounded-sm">
                    <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    {kpi.change}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Line Chart Section */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="bg-white border border-gray-200 p-4 sm:p-10 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-10 pb-4 sm:pb-6 border-b border-gray-100">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-gray-50 rounded-sm">
                  <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-2xl font-light text-gray-900 tracking-tight mb-0.5">
                    Évolution de la maturité
                  </h3>
                  <p className="text-xs sm:text-sm font-medium text-gray-500">Suivi historique des scores par dimension</p>
                </div>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-3 mt-1 sm:mt-0">
                <div className="text-[10px] sm:text-xs font-bold tracking-widest text-gray-400">DERNIERS 6 MOIS</div>
                <button
                  onClick={() => toast.success('Export des données', { description: 'Le fichier CSV a été téléchargé avec succès.' })}
                  className="p-2 bg-gray-50 text-gray-500 hover:text-black hover:bg-gray-100 transition-colors border border-gray-200"
                  aria-label="Exporter CSV"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="h-[280px] sm:h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mockHistoricalData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 600 }}
                    axisLine={{ stroke: '#E5E7EB', strokeWidth: 1.5 }}
                    tickLine={false}
                    dy={8}
                  />
                  <YAxis
                    domain={[0, 5]}
                    tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1F2937',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#F9FAFB',
                      fontSize: '12px'
                    }}
                  />
                  <Legend 
                    wrapperStyle={{ paddingTop: '20px', fontSize: '11px' }} 
                    iconType="circle" 
                    iconSize={6}
                    layout={window.innerWidth < 640 ? 'horizontal' : 'horizontal'}
                  />
                  <Line type="monotone" dataKey="gouvernance" stroke="#FFE600" strokeWidth={2.5} dot={{ fill: '#FFE600', r: 3 }} name="Gouvernance" />
                  <Line type="monotone" dataKey="qualite" stroke="#111827" strokeWidth={2.5} dot={{ fill: '#111827', r: 3 }} name="Qualité" />
                  <Line type="monotone" dataKey="architecture" stroke="#6B7280" strokeWidth={2.5} dot={{ fill: '#6B7280', r: 3 }} name="Architecture" />
                  <Line type="monotone" dataKey="usage" stroke="#9CA3AF" strokeWidth={2.5} dot={{ fill: '#9CA3AF', r: 3 }} name="Usage" />
                  <Line type="monotone" dataKey="culture" stroke="#D1D5DB" strokeWidth={2.5} dot={{ fill: '#D1D5DB', r: 3 }} name="Culture" />
                  <Line type="monotone" dataKey="strategie" stroke="#4B5563" strokeWidth={2.5} dot={{ fill: '#4B5563', r: 3 }} name="Stratégie" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>

        {/* Bottom Split Section */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8"
        >
          {/* Benchmark Bar Chart */}
          <div className="lg:col-span-8">
            <div className="bg-white border border-gray-200 p-5 sm:p-10 shadow-sm h-full">
              <div className="mb-6 sm:mb-10 pb-4 sm:pb-6 border-b border-gray-100">
                <h3 className="text-lg sm:text-2xl font-light text-gray-900 tracking-tight mb-0.5">
                  Comparaison inter-établissements
                </h3>
                <p className="text-xs sm:text-sm font-medium text-gray-500">Benchmark des scores globaux de maturité</p>
              </div>

              <div className="h-[300px] sm:h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mockEntityComparison} layout="vertical" margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                    <XAxis type="number" domain={[0, 5]} tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="entity"
                      tick={{ fill: '#111827', fontSize: 11, fontWeight: 600 }}
                      width={window.innerWidth < 640 ? 100 : 140}
                      axisLine={{ stroke: '#E5E7EB', strokeWidth: 1.5 }}
                      tickLine={false}
                    />
                    <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ backgroundColor: '#1F2937', border: 'none', color: '#F9FAFB', fontSize: '12px' }} />
                    <Bar dataKey="score" fill="#111827" radius={[0, 2, 2, 0]} barSize={window.innerWidth < 640 ? 18 : 26} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Top Performers & Quick Actions Stack */}
          <div className="lg:col-span-4 space-y-6 sm:space-y-8">
            {/* Top Performers widget */}
            <div className="bg-gray-900 text-white p-6 sm:p-8 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#FFE600]/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
              <div className="relative z-10 space-y-6">
                <div className="flex items-center gap-3 border-b border-gray-700 pb-4">
                  <TrendingUp className="w-4 h-4 text-[#FFE600]" />
                  <div className="text-[10px] sm:text-xs font-bold tracking-widest text-gray-400">TOP PERFORMERS</div>
                </div>
                <div className="space-y-4">
                  {mockEntityComparison
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 3)
                    .map((entity, index) => (
                      <div key={entity.entity} className="flex items-center gap-4">
                        <div
                          className={`text-base sm:text-xl font-bold w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center shadow-md ${
                            index === 0 ? 'bg-[#FFE600] text-black' : 'bg-gray-800 text-white border border-gray-700'
                          }`}
                        >
                          0{index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm sm:text-base font-semibold tracking-tight truncate">{entity.entity}</div>
                          <div className="text-xs sm:text-sm text-[#FFE600] font-bold">{entity.score.toFixed(1)} / 5.0</div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Quick Actions widget */}
            <div className="bg-white border border-gray-200 p-6 sm:p-8 shadow-sm">
              <div className="space-y-4">
                <div className="text-[10px] sm:text-xs font-bold tracking-widest text-gray-400 uppercase border-b border-gray-100 pb-3">
                  ACTIONS RAPIDES
                </div>
                <div className="space-y-2">
                  <button
                    onClick={() => navigate('/recommendations')}
                    className="w-full px-4 py-3 sm:py-4 border border-gray-200 text-left hover:border-black hover:shadow-md transition-all text-xs sm:text-sm font-bold text-gray-700 hover:text-black flex items-center justify-between group"
                  >
                    Voir les recommandations
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-black flex-shrink-0" />
                  </button>
                  <button
                    onClick={() => navigate('/simulation')}
                    className="w-full px-4 py-3 sm:py-4 border border-gray-200 text-left hover:border-black hover:shadow-md transition-all text-xs sm:text-sm font-bold text-gray-700 hover:text-black flex items-center justify-between group"
                  >
                    Lancer une simulation
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-black flex-shrink-0" />
                  </button>
                  <button
                    onClick={() => navigate('/results')}
                    className="w-full px-4 py-3 sm:py-4 border border-gray-200 text-left hover:border-black hover:shadow-md transition-all text-xs sm:text-sm font-bold text-gray-700 hover:text-black flex items-center justify-between group"
                  >
                    Exporter les rapports
                    <Download className="w-4 h-4 text-gray-400 group-hover:text-black flex-shrink-0" />
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