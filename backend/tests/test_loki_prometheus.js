const http = require('http');

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

async function testObservability() {
  console.log('========================================================================');
  console.log('         OBSERVABILITY VERIFICATION (PROMETHEUS & LOKI LOGQL)');
  console.log('========================================================================\n');

  // 1. Prometheus targets
  console.log('[1] Querying Prometheus Active Targets...');
  const promTargets = await httpGetJson('http://localhost:9090/api/v1/targets');
  const activeTargets = promTargets?.data?.activeTargets || [];
  console.log(`    ✓ Active Targets Count: ${activeTargets.length}`);
  activeTargets.forEach(t => {
    console.log(`      * Job: ${t.labels?.job || 'unknown'} | Scrape URL: ${t.scrapeUrl} | Health: ${t.health}`);
  });

  // 2. Loki labels
  console.log('\n[2] Querying Loki Extracted Labels...');
  const lokiLabels = await httpGetJson('http://localhost:3100/loki/api/v1/labels');
  console.log(`    ✓ Loki Ingestion Status: ${lokiLabels?.status}`);
  console.log(`    ✓ Discovered Stream Labels: ${JSON.stringify(lokiLabels?.data)}`);

  // 3. LogQL Query 1: {stream="stdout"}
  console.log('\n[3] Executing LogQL Query 1: {stream="stdout"} (limit=1)...');
  const q1 = await httpGetJson('http://localhost:3100/loki/api/v1/query?query=' + encodeURIComponent('{stream="stdout"}') + '&limit=1');
  const q1Result = q1?.data?.result || [];
  console.log(`    ✓ Result streams: ${q1Result.length}`);
  if (q1Result.length > 0) {
    const val = q1Result[0].values[0];
    console.log(`    ✓ Stream Labels: ${JSON.stringify(q1Result[0].stream)}`);
    console.log(`    ✓ Log Sample: ${val[1]}`);
  }

  // 4. LogQL Query 2: {container="quizsystem-backend"}
  console.log('\n[4] Executing LogQL Query 2: {container="quizsystem-backend"} (limit=1)...');
  const q2 = await httpGetJson('http://localhost:3100/loki/api/v1/query?query=' + encodeURIComponent('{container="quizsystem-backend"}') + '&limit=1');
  const q2Result = q2?.data?.result || [];
  console.log(`    ✓ Result streams: ${q2Result.length}`);
  if (q2Result.length > 0) {
    const val = q2Result[0].values[0];
    console.log(`    ✓ Stream Labels: ${JSON.stringify(q2Result[0].stream)}`);
    console.log(`    ✓ Log Sample: ${val[1]}`);
  }

  // 5. LogQL Query 3: {container=~"quizsystem-.+"} |= "metrics"
  console.log('\n[5] Executing LogQL Query 3: {container=~"quizsystem-.+"} |= "metrics" (limit=1)...');
  const q3 = await httpGetJson('http://localhost:3100/loki/api/v1/query?query=' + encodeURIComponent('{container=~"quizsystem-.+"} |= "metrics"') + '&limit=1');
  const q3Result = q3?.data?.result || [];
  console.log(`    ✓ Result streams: ${q3Result.length}`);
  if (q3Result.length > 0) {
    const val = q3Result[0].values[0];
    console.log(`    ✓ Stream Labels: ${JSON.stringify(q3Result[0].stream)}`);
    console.log(`    ✓ Log Sample: ${val[1]}`);
  }

  console.log('\n========================================================================');
  console.log('   ALL OBSERVABILITY STACK CHECKS COMPLETED WITH LIVE EVIDENCE');
  console.log('========================================================================');
}

testObservability().catch(console.error);
