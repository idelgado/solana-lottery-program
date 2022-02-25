import type { NextPage } from "next";
import Head from "next/head";
import { HomeView } from "../views";

const Home: NextPage = (props) => {
  return (
    <div>
      <Head>
        <title>No Loss Lottery!</title>
        <meta
          name="description"
          content="No Loss Lottery"
        />
      </Head>
      <HomeView />
    </div>
  );
};

export default Home;
