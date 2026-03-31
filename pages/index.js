import React, { useState, useRef, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  BarElement,
} from 'chart.js';

const Chart = dynamic(() => import('../components/Chart'), { ssr: false });

export default function Home() {
  const [pluginsLoaded, setPluginsLoaded] = useState(false);
  const zoomPluginRef = useRef(null);

  useEffect(() => {
    const loadPlugins = async () => {
      try {
        await import('hammerjs');
        const zoomPlugin = await import('chartjs-plugin-zoom');
        zoomPluginRef.current = zoomPlugin;
        ChartJS.register(
          CategoryScale,
          LinearScale,
          PointElement,
          LineElement,
          Title,
          Tooltip,
          Legend,
          BarElement,
          zoomPlugin.default
        );
        setPluginsLoaded(true);
      } catch (e) {
        console.error("Error loading plugins: ", e);
      }
    };

    loadPlugins();
  }, []);

  const [ticker, setTicker] = useState('');
  const thirtyDaysAgo = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];
  const thirtyDaysFromNow = new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(thirtyDaysFromNow);
  const [daysToPredict, setDaysToPredict] = useState(60);
  const [historicalData, setHistoricalData] = useState(null);
  const [macdData, setMacdData] = useState(null);
  const [rsiData, setRsiData] = useState(null);
  // const [sma200Data, setSma200Data] = useState(null);
  const [sma30Data, setSma30Data] = useState(null);
  const [sma10Data, setSma10Data] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [error, setError] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    const lastTicker = localStorage.getItem('lastTicker');
    if (lastTicker) {
      setTicker(lastTicker);
    }
  }, []);

  useEffect(() => {
    if (ticker) {
      localStorage.setItem('lastTicker', ticker);
    }
  }, [ticker]);

  const resetZoom = (chartId) => {
    const chart = ChartJS.getChart(chartId);
    if (chart) {
      chart.resetZoom();
    }
  };

  const fetchStockData = async (tickerSymbol) => {
    if (!tickerSymbol || isFetching) return;

    setIsFetching(true);
    setError(null);
    setHistoricalData(null);
    setMacdData(null);
    setRsiData(null);
    // setSma200Data(null);
    setSma30Data(null);
    setSma10Data(null);
    setPrediction(null);

    const apiKey = process.env.NEXT_PUBLIC_POLYGON_API_KEY;
    const upperTickerSymbol = tickerSymbol.toUpperCase();

    try {
      const from = startDate;
      const to = endDate;

      const urls = {
        aggregates: `https://api.polygon.io/v2/aggs/ticker/${upperTickerSymbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${apiKey}`,
        macd: `https://api.polygon.io/v1/indicators/macd/${upperTickerSymbol}?timespan=day&adjusted=true&short_window=12&long_window=26&signal_window=9&series_type=close&order=desc&apiKey=${apiKey}`,
        rsi: `https://api.polygon.io/v1/indicators/rsi/${upperTickerSymbol}?timespan=day&adjusted=true&window=14&series_type=close&order=desc&apiKey=${apiKey}`,
        // sma200: `https://api.polygon.io/v1/indicators/sma/${upperTickerSymbol}?timespan=day&adjusted=true&window=200&series_type=close&order=desc&apiKey=${apiKey}`,
        sma30: `https://api.polygon.io/v1/indicators/sma/${upperTickerSymbol}?timespan=day&adjusted=true&window=30&series_type=close&order=desc&apiKey=${apiKey}`,
        sma10: `https://api.polygon.io/v1/indicators/sma/${upperTickerSymbol}?timespan=day&adjusted=true&window=10&series_type=close&order=desc&apiKey=${apiKey}`,
      };

      const responses = await Promise.all(Object.values(urls).map(url => fetch(url)));

      for (const response of responses) {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      }

      const [aggregates, macd, rsi, sma30, sma10] = await Promise.all(responses.map(res => res.json()));

      if (!aggregates?.results?.length || !macd?.results?.values?.length || !rsi?.results?.values?.length || !sma30?.results?.values?.length || !sma10?.results?.values?.length) {
        throw new Error("Incomplete data returned from API. Please check ticker symbol and date range.");
      }

      setHistoricalData(aggregates);
      setMacdData(macd);
      setRsiData(rsi);
      // setSma200Data(sma200);
      setSma30Data(sma30);
      setSma10Data(sma10);

      // Prediction
      const predictionResponse = await fetch('/api/predict', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            macdData: macd, 
            closingPrices: aggregates.results.map(r => r.c),
            daysToPredict: daysToPredict
          })
      });

      if (!predictionResponse.ok) {
        const errorData = await predictionResponse.json();
        throw new Error(errorData.error || `HTTP error! status: ${predictionResponse.status}`);
      }

      const predictionResult = await predictionResponse.json();
      setPrediction(predictionResult.prediction);

    } catch (e) {
      setError(e.message);
      console.error(e);
    } finally {
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown(prevCountdown => {
          if (prevCountdown <= 1) {
            clearInterval(timer);
            setIsFetching(false);
            return 0;
          }
          return prevCountdown - 1;
        });
      }, 1000);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    fetchStockData(ticker);
  };

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    color: '#94a3b8',
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#94a3b8' }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#94a3b8' }
      }
    },
    plugins: {
      legend: {
        labels: { color: '#f8fafc', usePointStyle: true, boxWidth: 8 }
      },
      zoom: {
        pan: { enabled: true, mode: 'x' },
        zoom: {
          drag: { enabled: true },
          mode: 'x',
          wheel: { enabled: true },
          pinch: { enabled: true }
        }
      }
    },
  }), []);

  const getPriceChartData = () => {
    if (!historicalData || !sma30Data || !sma10Data) return {};

    const closingPrices = historicalData.results;

    const sma30Map = new Map();
    if (sma30Data.results && sma30Data.results.values) {
        sma30Data.results.values.forEach(d => {
            sma30Map.set(new Date(d.timestamp).toLocaleDateString(), d.value);
        });
    }

    const sma10Map = new Map();
    if (sma10Data.results && sma10Data.results.values) {
        sma10Data.results.values.forEach(d => {
            sma10Map.set(new Date(d.timestamp).toLocaleDateString(), d.value);
        });
    }

    const sma30PlotData = closingPrices.map(d => {
        const dateString = new Date(d.t).toLocaleDateString();
        return sma30Map.get(dateString) || null;
    });

    const sma10PlotData = closingPrices.map(d => {
        const dateString = new Date(d.t).toLocaleDateString();
        return sma10Map.get(dateString) || null;
    });

    const labels = closingPrices.map(d => new Date(d.t).toLocaleDateString());
    const datasets = [
      {
        label: 'Close Price',
        data: closingPrices.map(d => d.c),
        borderColor: '#38bdf8', // primary
        fill: false
      },
      {
        label: '30-Day SMA',
        data: sma30PlotData,
        borderColor: '#c084fc', // secondary
        fill: false,
        pointRadius: 0,
        spanGaps: true,
      },
      {
        label: '10-Day SMA',
        data: sma10PlotData,
        borderColor: '#34d399', // success
        fill: false,
        pointRadius: 0,
        spanGaps: true,
      }
    ];

    if (prediction && prediction.future_prices) {
      const lastHistoricalDate = new Date(closingPrices[closingPrices.length - 1].t);
      const lastPredictionDays = Math.max(...Object.keys(prediction.future_prices).map(d => parseInt(d)));

      const allFutureLabels = [];
      for (let i = 1; i <= lastPredictionDays; i++) {
        const futureDate = new Date(lastHistoricalDate);
        futureDate.setDate(lastHistoricalDate.getDate() + i);
        allFutureLabels.push(futureDate.toLocaleDateString());
      }
      labels.push(...allFutureLabels);

      datasets.forEach(dataset => {
        dataset.data.push(...Array(allFutureLabels.length).fill(null));
      });

      const lastPredictedPrice = prediction.future_prices[lastPredictionDays];
      const predictionColor = parseFloat(lastPredictedPrice) > prediction.lastClosingPrice ? '#34d399' : '#ef4444';

      const sparsePredictionData = Array(lastPredictionDays).fill(null);
      Object.entries(prediction.future_prices).forEach(([days, price]) => {
        const index = parseInt(days) - 1;
        if (index >= 0 && index < sparsePredictionData.length) {
          sparsePredictionData[index] = parseFloat(price);
        }
      });

      const predictionData = [
        ...Array(closingPrices.length - 1).fill(null),
        prediction.lastClosingPrice,
        ...sparsePredictionData
      ];

      datasets.push({
        label: 'Prediction',
        data: predictionData,
        borderColor: predictionColor,
        fill: false,
        borderDash: [5, 5],
        spanGaps: true,
      });
    }

    return { labels, datasets };
  }

  const getMacdChartData = () => {
    if (!macdData) return {};
    const values = [...macdData.results.values].reverse();
    return {
        labels: values.map(d => new Date(d.timestamp).toLocaleDateString()),
        datasets: [
            { label: 'MACD', data: values.map(d => d.value), borderColor: '#38bdf8', fill: false },
            { label: 'Signal', data: values.map(d => d.signal), borderColor: '#f59e0b', fill: false },
            { label: 'Histogram', data: values.map(d => d.histogram), backgroundColor: 'rgba(56, 189, 248, 0.3)', type: 'bar' }
        ]
    }
  }

  const getRsiChartData = () => {
      if (!rsiData) return {};
      const values = [...rsiData.results.values].reverse();
      return {
          labels: values.map(d => new Date(d.timestamp).toLocaleDateString()),
          datasets: [{ label: 'RSI', data: values.map(d => d.value), borderColor: '#ef4444', fill: false }]
      }
  }

  return (
    <div className="container">
      <h1>PredictStock AI</h1>
      
      <div className="card">
        <form onSubmit={handleSubmit} className="form-grid">
          <div className="input-group">
            <label htmlFor="tickerInput">Ticker Symbol</label>
            <input
              id="tickerInput"
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="e.g., AAPL"
              autoComplete="off"
            />
          </div>
          <div className="input-group">
            <label htmlFor="startDateInput">Start Date</label>
            <input
              id="startDateInput"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label htmlFor="endDateInput">End Date</label>
            <input
              id="endDateInput"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label htmlFor="predictionLengthInput">Prediction Length (Days)</label>
            <input
              id="predictionLengthInput"
              type="number"
              value={daysToPredict}
              onChange={(e) => setDaysToPredict(parseInt(e.target.value) || 0)}
              placeholder="e.g., 60"
              min="1"
            />
          </div>
          <button type="submit" className="btn" disabled={isFetching}>
            {isFetching ? <span className="loading-text">Analyzing ({countdown}s)...</span> : 'Run Prediction Model'}
          </button>
        </form>
        {error && <div className="text-danger mt-4" style={{ fontWeight: 500 }}>⚠ Error: {error}</div>}
      </div>

      {historicalData && pluginsLoaded && (
        <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
          
          {prediction && (
            <div className="card">
              <h2>Trend Prediction</h2>
              <div style={{ marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>AI Forecast Direction: </span>
                <span style={{ 
                  fontSize: '1.2rem', 
                  fontWeight: 700, 
                  color: prediction.trend === 'UP' ? 'var(--success)' : (prediction.trend === 'DOWN' ? 'var(--danger)' : 'var(--primary)'),
                  textTransform: 'uppercase',
                  letterSpacing: '2px'
                }}>
                  {prediction.trend}
                </span>
              </div>
              <p style={{ marginBottom: '1rem', textTransform: 'uppercase', fontSize: '0.875rem', letterSpacing: '1px' }}>Projected Milestones</p>
              <ul className="prediction-list">
                {Object.entries(prediction.future_prices).map(([days, price]) => (
                  <li key={days} className="prediction-item">
                    <span>{days} Days Out</span>
                    <span>${parseFloat(price).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card mt-8">
            <h2>Price Action & Moving Averages</h2>
            <div className="chart-container">
                {sma10Data && <Chart id="price-chart" data={getPriceChartData()} options={chartOptions} />}
            </div>
            <button className="btn btn-secondary mt-4" onClick={() => resetZoom('price-chart')}>Reset View</button>
          </div>

          <div className="card mt-8">
            <h2>Relative Strength Index (RSI 14)</h2>
            <div className="chart-container">
                {rsiData && <Chart id="rsi-chart" data={getRsiChartData()} options={chartOptions} />}
            </div>
            <button className="btn btn-secondary mt-4" onClick={() => resetZoom('rsi-chart')}>Reset View</button>
          </div>

          <div className="card mt-8">
            <h2>MACD Histogram</h2>
            <div className="chart-container">
                {macdData && <Chart id="macd-chart" data={getMacdChartData()} options={chartOptions} />}
            </div>
            <button className="btn btn-secondary mt-4" onClick={() => resetZoom('macd-chart')}>Reset View</button>
          </div>
          
        </div>
      )}
    </div>
  );
}
