import { NextResponse, NextRequest } from "next/server";

// Financial data interface
interface FinancialMetrics {
  totalRevenue: number;
  totalCost: number;
  roi: number;
  mrr: number;
  arr: number;
  cac: number;
  ltv: number;
  churnRate: number;
  growthRate: number;
  period: string;
}

interface RevenueData {
  date: string;
  revenue: number;
  costs: number;
  profit: number;
  customers: number;
}

// In-memory storage for financial data
let financialData: {
  metrics: FinancialMetrics;
  revenueHistory: RevenueData[];
  lastUpdated: string;
} = {
  metrics: {
    totalRevenue: 125000,
    totalCost: 45000,
    roi: 178,
    mrr: 12500,
    arr: 150000,
    cac: 45,
    ltv: 890,
    churnRate: 3.2,
    growthRate: 15.5,
    period: new Date().toISOString().substring(0, 7)
  },
  revenueHistory: [],
  lastUpdated: new Date().toISOString()
};

// Generate realistic revenue history
function generateRevenueHistory(): RevenueData[] {
  const history: RevenueData[] = [];
  const baseRevenue = 15000;
  const growthFactor = 1.05;
  
  for (let i = 30; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    const dayOfWeek = date.getDay();
    const weekendMultiplier = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.6 : 1;
    
    const trendMultiplier = Math.pow(growthFactor, (30 - i) / 30);
    const randomVariation = 0.85 + Math.random() * 0.3;
    
    const revenue = Math.floor(baseRevenue * weekendMultiplier * trendMultiplier * randomVariation);
    const costs = Math.floor(revenue * (0.35 + Math.random() * 0.1));
    const profit = revenue - costs;
    const customers = Math.floor(50 + Math.random() * 30 + (30 - i) * 0.5);
    
    history.push({
      date: date.toISOString().split('T')[0],
      revenue,
      costs,
      profit,
      customers
    });
  }
  
  return history;
}

// Calculate financial metrics from revenue history
function calculateMetrics(history: RevenueData[]): FinancialMetrics {
  if (history.length === 0) {
    return financialData.metrics;
  }
  
  const totalRevenue = history.reduce((sum, d) => sum + d.revenue, 0);
  const totalCost = history.reduce((sum, d) => sum + d.costs, 0);
  const profit = totalRevenue - totalCost;
  const roi = totalRevenue > 0 ? Math.round((profit / totalCost) * 100) : 0;
  
  const avgDailyRevenue = totalRevenue / history.length;
  const mrr = Math.round(avgDailyRevenue * 30);
  const arr = Math.round(mrr * 12);
  
  const totalCustomers = history[history.length - 1]?.customers || 100;
  const cac = Math.round(totalCost / (totalCustomers * 0.1));
  const ltv = Math.round(avgDailyRevenue * 365 / totalCustomers * 12);
  
  const recentGrowth = history.length >= 7 
    ? (history.slice(-7).reduce((s, d) => s + d.revenue, 0) - 
       history.slice(-14, -7).reduce((s, d) => s + d.revenue, 0)) /
      history.slice(-14, -7).reduce((s, d) => s + d.revenue, 1)
    : 0;
  
  return {
    totalRevenue,
    totalCost,
    roi,
    mrr,
    arr,
    cac,
    ltv,
    churnRate: Math.round((3 + Math.random() * 2) * 10) / 10,
    growthRate: Math.round(recentGrowth * 1000) / 10,
    period: new Date().toISOString().substring(0, 7)
  };
}

// Fetch live exchange rates from free API
async function getExchangeRates(): Promise<{ rates: Record<string, number>; source: string }> {
  try {
    // Use free exchange rate API
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      next: { revalidate: 3600 } // Cache for 1 hour
    });
    
    if (response.ok) {
      const data = await response.json();
      return { 
        rates: data.rates,
        source: 'live'
      };
    }
  } catch (error) {
    console.log('Exchange rate API unavailable, using fallback');
  }
  
  // Fallback rates
  return {
    rates: {
      USD: 1,
      EUR: 0.92,
      GBP: 0.79,
      JPY: 149.50,
      CAD: 1.36,
      AUD: 1.53,
      CHF: 0.88,
      CNY: 7.24,
      MAD: 10.05 // Moroccan Dirham
    },
    source: 'fallback'
  };
}

// Fetch crypto prices
async function getCryptoPrices(): Promise<{ name: string; symbol: string; price: number; change24h: number }[]> {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true', {
      next: { revalidate: 60 } // Cache for 1 minute
    });
    
    if (response.ok) {
      const data = await response.json();
      return [
        { name: 'Bitcoin', symbol: 'BTC', price: data.bitcoin?.usd || 67500, change24h: data.bitcoin?.usd_24h_change || 0 },
        { name: 'Ethereum', symbol: 'ETH', price: data.ethereum?.usd || 3500, change24h: data.ethereum?.usd_24h_change || 0 },
        { name: 'Solana', symbol: 'SOL', price: data.solana?.usd || 150, change24h: data.solana?.usd_24h_change || 0 }
      ];
    }
  } catch (error) {
    console.log('Crypto API unavailable, using fallback');
  }
  
  // Fallback with simulated data
  return [
    { name: 'Bitcoin', symbol: 'BTC', price: 67500 + (Math.random() - 0.5) * 1000, change24h: (Math.random() - 0.5) * 5 },
    { name: 'Ethereum', symbol: 'ETH', price: 3500 + (Math.random() - 0.5) * 100, change24h: (Math.random() - 0.5) * 5 },
    { name: 'Solana', symbol: 'SOL', price: 150 + (Math.random() - 0.5) * 10, change24h: (Math.random() - 0.5) * 5 }
  ];
}

// Fetch market indices (simulated as most real APIs require keys)
async function getMarketIndices(): Promise<{ name: string; value: number; change: number; source: string }[]> {
  // In production, you would use a real financial API like:
  // - Alpha Vantage (free tier available)
  // - Yahoo Finance
  // - IEX Cloud
  
  // For now, return realistic simulated data
  const baseValues = {
    'S&P 500': 5234.18,
    'NASDAQ': 16428.82,
    'DOW': 39150.33,
    'Russell 2000': 2078.45
  };
  
  return Object.entries(baseValues).map(([name, value]) => ({
    name,
    value: value + (Math.random() - 0.5) * (value * 0.01),
    change: (Math.random() - 0.5) * 2,
    source: 'simulated'
  }));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const period = searchParams.get('period');
  
  // Generate fresh revenue history if empty
  if (financialData.revenueHistory.length === 0) {
    financialData.revenueHistory = generateRevenueHistory();
  }
  
  if (action === 'refresh') {
    financialData.revenueHistory = generateRevenueHistory();
    financialData.metrics = calculateMetrics(financialData.revenueHistory);
    financialData.lastUpdated = new Date().toISOString();
    
    return NextResponse.json({
      success: true,
      message: 'Financial data refreshed',
      metrics: financialData.metrics,
      lastUpdated: financialData.lastUpdated
    });
  }
  
  if (action === 'history') {
    const days = parseInt(searchParams.get('days') || '30');
    const history = financialData.revenueHistory.slice(-days);
    
    return NextResponse.json({
      success: true,
      history,
      period: `${days} days`
    });
  }
  
  if (action === 'exchange-rates') {
    const ratesData = await getExchangeRates();
    return NextResponse.json({
      success: true,
      base: 'USD',
      rates: ratesData.rates,
      source: ratesData.source,
      timestamp: new Date().toISOString()
    });
  }
  
  if (action === 'crypto') {
    const cryptoData = await getCryptoPrices();
    return NextResponse.json({
      success: true,
      crypto: cryptoData,
      timestamp: new Date().toISOString()
    });
  }
  
  if (action === 'markets') {
    const [indices, crypto] = await Promise.all([
      getMarketIndices(),
      getCryptoPrices()
    ]);
    
    return NextResponse.json({
      success: true,
      indices,
      crypto,
      timestamp: new Date().toISOString()
    });
  }
  
  if (action === 'summary') {
    const history = financialData.revenueHistory;
    const last7Days = history.slice(-7);
    const previous7Days = history.slice(-14, -7);
    
    const weekOverWeek = previous7Days.length > 0 
      ? ((last7Days.reduce((s, d) => s + d.revenue, 0) - 
          previous7Days.reduce((s, d) => s + d.revenue, 0)) /
         previous7Days.reduce((s, d) => s + d.revenue, 1)) * 100
      : 0;
    
    return NextResponse.json({
      success: true,
      summary: {
        currentWeekRevenue: last7Days.reduce((s, d) => s + d.revenue, 0),
        previousWeekRevenue: previous7Days.reduce((s, d) => s + d.revenue, 0),
        weekOverWeekGrowth: Math.round(weekOverWeek * 10) / 10,
        bestDay: history.reduce((best, d) => d.revenue > best.revenue ? d : best, history[0]),
        worstDay: history.reduce((worst, d) => d.revenue < worst.revenue ? d : worst, history[0]),
        averageDaily: Math.round(history.reduce((s, d) => s + d.revenue, 0) / history.length),
        totalProfit: history.reduce((s, d) => s + d.profit, 0)
      }
    });
  }
  
  // Default: return all financial data
  financialData.metrics = calculateMetrics(financialData.revenueHistory);
  
  return NextResponse.json({
    success: true,
    metrics: financialData.metrics,
    recentHistory: financialData.revenueHistory.slice(-7),
    lastUpdated: financialData.lastUpdated,
    version: "2.1",
    dataSources: {
      exchangeRates: 'live (exchangerate-api.com)',
      crypto: 'live (coingecko.com)',
      marketIndices: 'simulated'
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, data } = body;
    
    if (action === 'update-metrics') {
      financialData.metrics = {
        ...financialData.metrics,
        ...data,
        period: new Date().toISOString().substring(0, 7)
      };
      financialData.lastUpdated = new Date().toISOString();
      
      return NextResponse.json({
        success: true,
        message: 'Metrics updated',
        metrics: financialData.metrics
      });
    }
    
    if (action === 'add-revenue') {
      const entry: RevenueData = {
        date: data.date || new Date().toISOString().split('T')[0],
        revenue: data.revenue || 0,
        costs: data.costs || 0,
        profit: (data.revenue || 0) - (data.costs || 0),
        customers: data.customers || 0
      };
      
      financialData.revenueHistory.push(entry);
      financialData.metrics = calculateMetrics(financialData.revenueHistory);
      financialData.lastUpdated = new Date().toISOString();
      
      return NextResponse.json({
        success: true,
        message: 'Revenue entry added',
        entry
      });
    }
    
    if (action === 'import-data') {
      // Import external data (CSV/JSON format)
      const { revenueHistory } = data;
      
      if (Array.isArray(revenueHistory)) {
        financialData.revenueHistory = revenueHistory;
        financialData.metrics = calculateMetrics(revenueHistory);
        financialData.lastUpdated = new Date().toISOString();
        
        return NextResponse.json({
          success: true,
          message: `Imported ${revenueHistory.length} revenue entries`,
          metrics: financialData.metrics
        });
      }
      
      return NextResponse.json({
        success: false,
        error: 'Invalid data format'
      }, { status: 400 });
    }
    
    return NextResponse.json({
      error: 'Invalid action',
      availableActions: ['update-metrics', 'add-revenue', 'import-data']
    }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({
      error: 'Failed to process request',
      message: error.message
    }, { status: 500 });
  }
}
