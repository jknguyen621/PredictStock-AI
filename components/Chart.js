
import React, { forwardRef } from 'react';
import { Line } from 'react-chartjs-2';

const Chart = forwardRef((props, ref) => {
  return <Line ref={ref} {...props} />;
});

Chart.displayName = 'Chart';

export default Chart;
