
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
  const [sma200Data, setSma200Data] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [error, setError] = useState(null);

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
    if (!tickerSymbol) return;

    setError(null);
    setHistoricalData(null);
    setMacdData(null);
    setRsiData(null);
    setSma200Data(null);
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
        sma200: `https://api.polygon.io/v1/indicators/sma/${upperTickerSymbol}?timespan=day&adjusted=true&window=200&series_type=close&order=desc&apiKey=${apiKey}`,
      };

      const responses = await Promise.all(Object.values(urls).map(url => fetch(url)));

      for (const response of responses) {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      }

      const [aggregates, macd, rsi, sma200] = await Promise.all(responses.map(res => res.json()));

      if (!aggregates?.results?.length || !macd?.results?.values?.length || !rsi?.results?.values?.length || !sma200?.results?.values?.length) {
        throw new Error("Incomplete data returned from API. Please check ticker symbol and date range.");
      }

      setHistoricalData(aggregates);
      setMacdData(macd);
      setRsiData(rsi);
      setSma200Data(sma200);

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
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    fetchStockData(ticker);
  };

  const chartOptions = useMemo(() => ({
    plugins: {
      zoom: {
        pan: {
          enabled: true,
          mode: 'x',
        },
        zoom: {
          drag: {
            enabled: true,
          },
          mode: 'x',
          wheel: {
            enabled: true,
          },
          pinch: {
            enabled: true
          },
        }
      }
    },
  }), []);

  const getPriceChartData = () => {
    if (!historicalData || !sma200Data) return {};

    const closingPrices = historicalData.results;

    const sma200Map = new Map();
    if (sma200Data.results && sma200Data.results.values) {
        sma200Data.results.values.forEach(d => {
            sma200Map.set(new Date(d.timestamp).toLocaleDateString(), d.value);
        });
    }

    const sma200PlotData = closingPrices.map(d => {
        const dateString = new Date(d.t).toLocaleDateString();
        return sma200Map.get(dateString) || null;
    });

    const labels = closingPrices.map(d => new Date(d.t).toLocaleDateString());
    const datasets = [
      {
        label: 'Close Price',
        data: closingPrices.map(d => d.c),
        borderColor: 'blue',
        fill: false
      },
      {
        label: '200-Day SMA',
        data: sma200PlotData,
        borderColor: 'orange',
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
      const predictionColor = parseFloat(lastPredictedPrice) > prediction.lastClosingPrice ? 'green' : 'red';

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
            { label: 'MACD', data: values.map(d => d.value), borderColor: 'blue', fill: false },
            { label: 'Signal', data: values.map(d => d.signal), borderColor: 'orange', fill: false },
            { label: 'Histogram', data: values.map(d => d.histogram), backgroundColor: 'rgba(128, 128, 128, 0.5)', type: 'bar' }
        ]
    }
  }

  const getRsiChartData = () => {
      if (!rsiData) return {};
      const values = [...rsiData.results.values].reverse();
      return {
          labels: values.map(d => new Date(d.timestamp).toLocaleDateString()),
          datasets: [{ label: 'RSI', data: values.map(d => d.value), borderColor: 'red', fill: false }]
      }
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', margin: '2em' }}>
      <h1>Stock Price Predictor</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="Enter Ticker Symbol (e.g., AAPL)"
          style={{ padding: '0.5em', marginRight: '1em' }}
        />
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={{ padding: '0.5em', marginRight: '1em' }}
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          style={{ padding: '0.5em', marginRight: '1em' }}
        />
        <input
          type="number"
          value={daysToPredict}
          onChange={(e) => setDaysToPredict(parseInt(e.target.value))}
          placeholder="Days to Predict"
          style={{ padding: '0.5em', marginRight: '1em', width: '120px' }}
        />
        <button type="submit" style={{ padding: '0.5em 1em' }}>
          Predict
        </button>
      </form>

      {error && <div style={{color: 'red', marginTop: '1em'}}>Error: {error}</div>}

      {historicalData && pluginsLoaded && (
        <div>
            <div style={{ marginTop: '2em' }}>
                <h2>Historical Data with 200-Day SMA</h2>
                <div style={{ border: '1px solid #ccc', padding: '1em', minHeight: '200px' }}>
                    {sma200Data && <Chart id="price-chart" data={getPriceChartData()} options={chartOptions} />}
                </div>
                <button onClick={() => resetZoom('price-chart')} style={{ marginTop: '1em' }}>Reset Zoom</button>
            </div>
            <div style={{ marginTop: '2em' }}>
                <h2>RSI (14-Day)</h2>
                <div style={{ border: '1px solid #ccc', padding: '1em', minHeight: '200px' }}>
                    {rsiData && <Chart id="rsi-chart" data={getRsiChartData()} options={chartOptions} />}
                </div>
                <button onClick={() => resetZoom('rsi-chart')} style={{ marginTop: '1em' }}>Reset Zoom</button>
            </div>
            <div style={{ marginTop: '2em' }}>
                <h2>MACD Plot</h2>
                <div style={{ border: '1px solid #ccc', padding: '1em', minHeight: '200px' }}>
                    {macdData && <Chart id="macd-chart" data={getMacdChartData()} options={chartOptions} />}
                </div>
                <button onClick={() => resetZoom('macd-chart')} style={{ marginTop: '1em' }}>Reset Zoom</button>
            </div>
             <div style={{ marginTop: '2em' }}>
                <h2>Prediction</h2>
                <div style={{ border: '1px solid #ccc', padding: '1em' }}>
                {prediction ? (
                    <div>
                    <p><strong>Trend:</strong> {prediction.trend}</p>
                    <strong>Future Prices:</strong>
                    <ul>
                        {Object.entries(prediction.future_prices).map(([days, price]) => (
                        <li key={days}>{`${days} Days: $${price}`}</li>
                        ))}
                    </ul>
                    </div>
                ) : (
                    "[Prediction Result]"
                )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
