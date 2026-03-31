import '../styles/globals.css'
import Head from 'next/head'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>PredictStock AI | AntiGravity</title>
        <meta name="description" content="AI Stock Price Predictor powered by Next.js and Firebase Studio" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Component {...pageProps} />
    </>
  )
}
