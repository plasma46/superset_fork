// src/plugin/index.ts

import { ChartMetadata, ChartPlugin } from '@superset-ui/core';
import buildQuery from './buildQuery';
import controlPanel from './controlPanel';
import transformProps from './transformProps';
import RankFlow from '../PluginChartRankFlow';
import thumbnail from '../images/thumbnail.png';

export default class RankFlowChartPlugin extends ChartPlugin {
  constructor() {
    const metadata = new ChartMetadata({
      name: 'Rank Flow',
      description: 'Shows rank changes between stages',
      thumbnail,
    });

    super({
      metadata,
      buildQuery,          // без ()
      controlPanel,
      transformProps,      // именно transformProps
      loadChart: () => Promise.resolve(RankFlow),
    });
  }
}