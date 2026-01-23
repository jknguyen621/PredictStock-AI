
function linearRegression(x, y) {
  const n = x.length;
  let sum_x = 0;
  let sum_y = 0;
  let sum_xy = 0;
  let sum_xx = 0;

  for (let i = 0; i < n; i++) {
    sum_x += x[i];
    sum_y += y[i];
    sum_xy += x[i] * y[i];
    sum_xx += x[i] * x[i];
  }

  const slope = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x);
  const intercept = (sum_y - slope * sum_x) / n;

  return { slope, intercept };
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { macdData, closingPrices, daysToPredict } = req.body;

      if (!macdData || !closingPrices || !daysToPredict) {
        return res.status(400).json({ error: 'Missing required prediction data.' });
      }

      const latestMacd = macdData.results.values[0];

      let trend = 'Neutral';
      let slope_adjustment = 1.0;
      if (latestMacd.value > latestMacd.signal) {
        trend = 'Bullish';
        slope_adjustment = 1.02;
      } else if (latestMacd.value < latestMacd.signal) {
        trend = 'Bearish';
        slope_adjustment = 0.98;
      }

      const future_prices = {};
      let currentPrices = [...closingPrices];

      for (let i = 1; i <= daysToPredict; i++) {
          const y = currentPrices;
          const x = Array.from({ length: y.length }, (_, j) => j);

          let { slope, intercept } = linearRegression(x, y);
          slope *= slope_adjustment;

          const futureIndex = x.length;
          const predictedPrice = slope * futureIndex + intercept;
          future_prices[i] = predictedPrice.toFixed(2);

          currentPrices.push(predictedPrice);
      }

      const lastClosingPrice = closingPrices[closingPrices.length - 1];

      res.status(200).json({ prediction: { trend, future_prices, lastClosingPrice } });
    } catch (error) {
      console.error("Prediction API Error:", error.message);
      res.status(500).json({ error: 'Failed to generate prediction.' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
