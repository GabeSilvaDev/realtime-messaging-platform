import { Client } from '@elastic/elasticsearch';
import config from '../config/database';

const elasticConfig = config.elasticsearch;

const elasticsearch = new Client({
  node: elasticConfig.node,
  auth: elasticConfig.auth,
  tls: elasticConfig.tls,
});

async function connectElasticsearch(): Promise<void> {
  await elasticsearch.cluster.health({});
}

async function disconnectElasticsearch(): Promise<void> {
  await elasticsearch.close();
}

export { elasticsearch, connectElasticsearch, disconnectElasticsearch };
export default elasticsearch;
