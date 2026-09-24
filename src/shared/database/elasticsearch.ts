import { Client } from '@elastic/elasticsearch';
import config from '../config/database';
import { ELASTICSEARCH_DEFAULTS } from '../constants';

const elasticConfig = config.elasticsearch;

const elasticsearch = new Client({
  node: elasticConfig.node,
  auth: elasticConfig.auth,
  tls: elasticConfig.tls,
  requestTimeout: ELASTICSEARCH_DEFAULTS.REQUEST_TIMEOUT_MS,
});

async function connectElasticsearch(): Promise<void> {
  await elasticsearch.cluster.health({});
}

async function disconnectElasticsearch(): Promise<void> {
  await elasticsearch.close();
}

export { elasticsearch, connectElasticsearch, disconnectElasticsearch };
export default elasticsearch;
