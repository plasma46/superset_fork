// src/plugin/index.ts

import { ChartMetadata, ChartPlugin, t } from '@superset-ui/core';
import buildQuery from './buildQuery';
import controlPanel from './controlPanel';
import transformProps from './transformProps';
import RankFlow from '../PluginChartRankFlow';
import thumbnail from '../images/thumbnail.png';

export default class RankFlowChartPlugin extends ChartPlugin {
  constructor() {
    const metadata = new ChartMetadata({
      name: t('Rank Flow'),
      description: t('Shows rank changes between stages'),
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