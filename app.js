/* ===========================================
   门店流量分析报告生成器 - 核心逻辑
   =========================================== */

// ── Provider Presets ──
const PROVIDERS = {
  qwen: { name: '通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-vl-max' },
  moonshot: { name: 'Moonshot', endpoint: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-128k-vision' },
  zhipu: { name: '智谱 GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4v-plus' },
  deepseek: { name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' },
  openai: { name: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o' },
  custom: { name: '自定义', endpoint: '', model: '' }
};

// ── State ──
const state = {
  step: 1,
  images: [],        // { file, dataUrl, name }
  settings: { provider: 'qwen', endpoint: '', model: '', apiKey: '' },
  storeData: null,   // extracted data object
};

// ── Default empty data schema ──
function emptyData() {
  return {
    store: { name:'',address:'',coords:'',tags:'',rating:'',avgPrice:'',hours:'',analysisRange:'门店周边1km' },
    poi: { seafood:'',bbq:'',stirfry:'',bus:'',residential:'',office:'',mall:'',avgRating:'' },
    monthlyTraffic: [
      {month:'1月',value:0},{month:'2月',value:0},{month:'3月',value:0},
      {month:'4月',value:0},{month:'5月',value:0},{month:'6月',value:0}
    ],
    forecast: [
      {month:'',traffic:'',growth:'',level:'',factor:''},
      {month:'',traffic:'',growth:'',level:'',factor:''},
      {month:'',traffic:'',growth:'',level:'',factor:''}
    ],
    customerProfile: {
      segments: [{label:'本地熟客',pct:0},{label:'周边白领',pct:0},{label:'外地游客',pct:0},{label:'学生群体',pct:0},{label:'家庭聚餐',pct:0}],
      preferences: [{label:'堂食',pct:0},{label:'外卖',pct:0},{label:'团购',pct:0},{label:'预订包间',pct:0},{label:'商务宴请',pct:0}],
      age: [{label:'18-24岁',pct:0},{label:'25-34岁',pct:0},{label:'35-44岁',pct:0},{label:'45-54岁',pct:0},{label:'55岁+',pct:0}],
      malePct: 0, femalePct: 0
    },
    heatmap: {
      lunch:   [0,0,0,0,0,0,0],
      tea:     [0,0,0,0,0,0,0],
      dinner:  [0,0,0,0,0,0,0],
      latesnack:[0,0,0,0,0,0,0]
    },
    insights: [
      {title:'',content:'',color:'#2563eb'},
      {title:'',content:'',color:'#d97706'},
      {title:'',content:'',color:'#16a34a'},
      {title:'',content:'',color:'#7c3aed'},
      {title:'',content:'',color:'#dc2626'}
    ],
    competitors: [
      {name:'',rating:'',avgPrice:'',type:'',distance:'',advantage:''},
      {name:'',rating:'',avgPrice:'',type:'',distance:'',advantage:''},
      {name:'',rating:'',avgPrice:'',type:'',distance:'',advantage:''}
    ]
  };
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  applySettings();
  showStep(1);
  bindEvents();
});

function loadSettings() {
  try {
    const saved = localStorage.getItem('srt_settings');
    if (saved) Object.assign(state.settings, JSON.parse(saved));
  } catch(e) {}
}
function saveSettings() {
  try { localStorage.setItem('srt_settings', JSON.stringify(state.settings)); } catch(e) {}
}
function applySettings() {
  document.getElementById('apiProvider').value = state.settings.provider || 'qwen';
  document.getElementById('apiEndpoint').value = state.settings.endpoint || PROVIDERS[state.settings.provider]?.endpoint || '';
  document.getElementById('apiModel').value = state.settings.model || PROVIDERS[state.settings.provider]?.model || '';
  document.getElementById('apiKey').value = state.settings.apiKey || '';
  highlightPreset(state.settings.provider);
}

// ── Step Navigation ──
function showStep(n) {
  state.step = n;
  document.querySelectorAll('.section-panel').forEach(el => el.classList.remove('active'));
  const panel = document.getElementById('step' + n);
  if (panel) panel.classList.add('active');
  document.querySelectorAll('.step-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i + 1 === n);
    dot.classList.toggle('done', i + 1 < n);
  });
}

function nextStep() {
  if (state.step === 1) {
    // collect settings
    state.settings.provider = document.getElementById('apiProvider').value;
    state.settings.endpoint = document.getElementById('apiEndpoint').value;
    state.settings.model = document.getElementById('apiModel').value;
    state.settings.apiKey = document.getElementById('apiKey').value.trim();
    saveSettings();
    if (!state.settings.apiKey) { showToast('请先填写 API Key', 'error'); return; }
    if (state.images.length === 0) { showToast('请上传至少一张门店截图', 'error'); return; }
    showStep(2);
    startExtraction();
  } else if (state.step === 2) {
    collectFormData();
    showStep(3);
    renderPreview();
  } else if (state.step === 3) {
    collectFormData();
    generateAndDownload();
  }
}
function prevStep() {
  if (state.step > 1) showStep(state.step - 1);
}

// ── Events ──
function bindEvents() {
  // Upload
  const zone = document.getElementById('uploadZone');
  const input = document.getElementById('fileInput');
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); });
  input.addEventListener('change', e => handleFiles(e.target.files));

  // Paste
  document.addEventListener('paste', e => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const item of items) { if (item.type.startsWith('image/')) files.push(item.getAsFile()); }
    if (files.length) handleFiles(files);
  });

  // Provider select
  document.getElementById('apiProvider').addEventListener('change', e => {
    const p = e.target.value;
    if (PROVIDERS[p] && p !== 'custom') {
      document.getElementById('apiEndpoint').value = PROVIDERS[p].endpoint;
      document.getElementById('apiModel').value = PROVIDERS[p].model;
    }
    highlightPreset(p);
  });

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.provider;
      document.getElementById('apiProvider').value = p;
      if (PROVIDERS[p] && p !== 'custom') {
        document.getElementById('apiEndpoint').value = PROVIDERS[p].endpoint;
        document.getElementById('apiModel').value = PROVIDERS[p].model;
      }
      highlightPreset(p);
    });
  });
}

function highlightPreset(p) {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.provider === p);
  });
}

// ── Image Upload ──
function handleFiles(fileList) {
  const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      state.images.push({ file, dataUrl: e.target.result, name: file.name });
      renderPreviews();
    };
    reader.readAsDataURL(file);
  });
}

function renderPreviews() {
  const grid = document.getElementById('previewGrid');
  const count = document.getElementById('imageCount');
  grid.innerHTML = state.images.map((img, i) => `
    <div class="preview-item">
      <img src="${img.dataUrl}" alt="${img.name}">
      <button class="remove-btn" onclick="removeImage(${i})" title="移除">✕</button>
    </div>
  `).join('');
  count.textContent = state.images.length + ' 张';
}

function removeImage(i) {
  state.images.splice(i, 1);
  renderPreviews();
}

// ── AI Extraction ──
async function startExtraction() {
  const loading = document.getElementById('loadingOverlay');
  const statusEl = document.getElementById('extractStatus');
  loading.classList.add('active');
  statusEl.textContent = '正在分析截图，请稍候...';

  try {
    const data = await callAIExtraction();
    state.storeData = mergeData(emptyData(), data);
    renderAllForms();
    loading.classList.remove('active');
    showToast('数据提取完成，请检查并修正', 'success');
    updateCompleteness();
  } catch (err) {
    loading.classList.remove('active');
    console.error(err);
    showToast('AI提取失败: ' + err.message, 'error');
    // Still allow manual editing
    state.storeData = emptyData();
    renderAllForms();
  }
}

async function callAIExtraction() {
  const { endpoint, model, apiKey } = state.settings;

  // Build messages with images
  const content = [];
  state.images.forEach(img => {
    content.push({ type: 'image_url', image_url: { url: img.dataUrl } });
  });
  content.push({ type: 'text', text: EXTRACTION_PROMPT });

  const body = {
    model: model,
    messages: [{ role: 'user', content }],
    temperature: 0.1,
    max_tokens: 4000
  };

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`API返回 ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const json = await resp.json();
  const text = json.choices?.[0]?.message?.content || '';

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) throw new Error('AI返回格式异常，未找到JSON数据');

  return JSON.parse(jsonMatch[1]);
}

const EXTRACTION_PROMPT = `你是一个专业的门店数据分析助手。请仔细分析用户上传的所有截图，从中提取**明确可见**的信息。

## 核心原则（必须严格遵守）
1. **只提取截图中明确可见的信息**，绝对不要编造、猜测或推断任何数字
2. 截图中看不到的字段，一律填""或0
3. 严格返回JSON，不要添加任何说明文字

## 截图类型识别
先判断截图来源，不同类型可提取的信息不同：
- **高德/百度地图**：门店名称、地址、坐标、评分、周边搜索结果（POI数量）、竞品列表
- **大众点评/美团**：门店名称、评分、人均、评价数、标签、菜品、竞品
- **后台数据面板**：流量趋势图表、客群画像饼图、热力图、消费偏好等
- **其他**：尽力提取可见信息

## JSON提取格式

{
  "store": {
    "name": "门店完整名称（必须和截图中显示的完全一致，不要缩短或修改）",
    "address": "完整地址（截图中显示的）",
    "coords": "经纬度（仅当截图中明确显示时，如121.63,38.92）",
    "tags": "业态标签（逗号分隔）",
    "rating": "评分数字（仅截图中有评分时）",
    "avgPrice": "人均消费数字（仅截图中有时）",
    "hours": "营业时间（如10:30-21:30，仅截图中有时）",
    "analysisRange": "门店周边1km"
  },
  "poi": {
    "_note": "仅当截图中有搜索结果列表或周边信息时才填写",
    "seafood": "截图搜索结果中该业态的数量（根据实际业态调整字段名）",
    "bbq": "同类",
    "stirfry": "同类",
    "bus": "公交站数量（仅截图显示时）",
    "residential": "住宅小区数量（仅截图显示时）",
    "office": "写字楼数量（仅截图显示时）",
    "mall": "商场数量（仅截图显示时）",
    "avgRating": "周边门店平均评分（仅截图显示时）"
  },
  "monthlyTraffic": [
    {"month": "月份名", "value": "客流数字（仅截图有流量图表时）"}
  ],
  "forecast": [
    {"month": "月份", "traffic": "预测客流", "growth": "环比", "level": "高/中/低", "factor": "因素"}
  ],
  "customerProfile": {
    "segments": [{"label":"客群类型","pct":百分比}],
    "preferences": [{"label":"消费偏好","pct":百分比}],
    "age": [{"label":"年龄段","pct":百分比}],
    "malePct": "男性占比（仅截图显示时）",
    "femalePct": "女性占比（仅截图显示时）"
  },
  "heatmap": {
    "lunch": [7个0-10数字，仅截图有热力图时],
    "tea": [7个数字],
    "dinner": [7个数字],
    "latesnack": [7个数字]
  },
  "insights": [
    {"title": "经营发现", "content": "详细建议，优先植入高德卖点：搜索优化、导航到店闭环、旅游场景、本地生活团购、LBS精准投放", "color": "#2563eb"}
  ],
  "competitors": [
    {"name": "竞品名", "rating": "评分", "avgPrice": "人均", "type": "业态", "distance": "距离", "advantage": "优势"}
  ]
}

## 特别注意
1. poi字段中的业态类别（seafood/bbq/stirfry）应根据截图中的实际业态灵活调整字段名
2. insights至少3条，结合截图数据，优先推荐高德地图能力
3. 所有数字不加单位`;

// ── Merge extracted data into empty schema ──
function mergeData(base, extracted) {
  if (!extracted) return base;
  const d = JSON.parse(JSON.stringify(base));

  // Store info
  if (extracted.store) Object.assign(d.store, filterObj(extracted.store));

  // POI
  if (extracted.poi) Object.assign(d.poi, filterObj(extracted.poi));

  // Monthly traffic
  if (Array.isArray(extracted.monthlyTraffic) && extracted.monthlyTraffic.length) {
    d.monthlyTraffic = extracted.monthlyTraffic.map(m => ({
      month: String(m.month || ''),
      value: Number(m.value) || 0
    }));
  }

  // Forecast
  if (Array.isArray(extracted.forecast) && extracted.forecast.length) {
    d.forecast = extracted.forecast.map(f => ({
      month: String(f.month || ''),
      traffic: String(f.traffic || ''),
      growth: String(f.growth || ''),
      level: String(f.level || ''),
      factor: String(f.factor || '')
    }));
  }

  // Customer profile
  if (extracted.customerProfile) {
    const cp = extracted.customerProfile;
    if (Array.isArray(cp.segments) && cp.segments.length) d.customerProfile.segments = cp.segments.map(s => ({label:String(s.label||''),pct:Number(s.pct)||0}));
    if (Array.isArray(cp.preferences) && cp.preferences.length) d.customerProfile.preferences = cp.preferences.map(s => ({label:String(s.label||''),pct:Number(s.pct)||0}));
    if (Array.isArray(cp.age) && cp.age.length) d.customerProfile.age = cp.age.map(s => ({label:String(s.label||''),pct:Number(s.pct)||0}));
    if (cp.malePct != null) d.customerProfile.malePct = Number(cp.malePct) || 0;
    if (cp.femalePct != null) d.customerProfile.femalePct = Number(cp.femalePct) || 0;
  }

  // Heatmap
  if (extracted.heatmap) {
    ['lunch','tea','dinner','latesnack'].forEach(k => {
      if (Array.isArray(extracted.heatmap[k]) && extracted.heatmap[k].length === 7) {
        d.heatmap[k] = extracted.heatmap[k].map(v => Math.min(10, Math.max(0, Number(v) || 0)));
      }
    });
  }

  // Insights
  if (Array.isArray(extracted.insights) && extracted.insights.length) {
    d.insights = extracted.insights.slice(0, 5).map(ins => ({
      title: String(ins.title || ''),
      content: String(ins.content || ''),
      color: String(ins.color || '#2563eb')
    }));
    while (d.insights.length < 5) d.insights.push({title:'',content:'',color:'#2563eb'});
  }

  // Competitors
  if (Array.isArray(extracted.competitors) && extracted.competitors.length) {
    d.competitors = extracted.competitors.slice(0, 5).map(c => ({
      name: String(c.name||''), rating: String(c.rating||''), avgPrice: String(c.avgPrice||''),
      type: String(c.type||''), distance: String(c.distance||''), advantage: String(c.advantage||'')
    }));
  }

  return d;
}

function filterObj(obj) {
  const r = {};
  for (const [k,v] of Object.entries(obj)) { if (v !== null && v !== undefined) r[k] = v; }
  return r;
}

// ── Render Form Fields ──
function renderAllForms() {
  const d = state.storeData;
  if (!d) return;

  // Store info
  setInput('storeName', d.store.name);
  setInput('storeAddress', d.store.address);
  setInput('storeCoords', d.store.coords);
  setInput('storeTags', d.store.tags);
  setInput('storeRating', d.store.rating);
  setInput('storeAvgPrice', d.store.avgPrice);
  setInput('storeHours', d.store.hours);
  setInput('analysisRange', d.store.analysisRange);

  // POI
  setInput('poiSeafood', d.poi.seafood);
  setInput('poiBbq', d.poi.bbq);
  setInput('poiStirfry', d.poi.stirfry);
  setInput('poiBus', d.poi.bus);
  setInput('poiResidential', d.poi.residential);
  setInput('poiOffice', d.poi.office);
  setInput('poiMall', d.poi.mall);
  setInput('poiAvgRating', d.poi.avgRating);

  // Monthly traffic
  renderTrafficForm();

  // Forecast
  renderForecastForm();

  // Customer profile
  renderSegmentsForm();
  renderPreferencesForm();
  renderAgeForm();
  setInput('genderMale', d.customerProfile.malePct);
  setInput('genderFemale', d.customerProfile.femalePct);

  // Heatmap
  renderHeatmapForm();

  // Insights
  renderInsightsForm();

  // Competitors
  renderCompetitorsForm();
}

function setInput(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}

function renderTrafficForm() {
  const c = document.getElementById('trafficList');
  c.innerHTML = state.storeData.monthlyTraffic.map((m, i) => `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <input type="text" value="${m.month}" style="width:60px" data-ti="${i}" data-tf="month" onchange="updateTrafficField(this)">
      <input type="number" value="${m.value}" style="flex:1" data-ti="${i}" data-tf="value" onchange="updateTrafficField(this)">
      <button class="btn btn-sm btn-secondary" onclick="removeTrafficRow(${i})" title="删除">×</button>
    </div>
  `).join('') + `<button class="btn btn-sm btn-secondary" onclick="addTrafficRow()" style="margin-top:4px">+ 添加月份</button>`;
}

function updateTrafficField(el) {
  const i = Number(el.dataset.ti), f = el.dataset.tf;
  state.storeData.monthlyTraffic[i][f] = f === 'value' ? Number(el.value) || 0 : el.value;
}
function removeTrafficRow(i) { state.storeData.monthlyTraffic.splice(i, 1); renderTrafficForm(); }
function addTrafficRow() { state.storeData.monthlyTraffic.push({month:'',value:0}); renderTrafficForm(); }

function renderForecastForm() {
  const c = document.getElementById('forecastList');
  const d = state.storeData.forecast;
  c.innerHTML = d.map((f, i) => `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 2fr auto;gap:6px;margin-bottom:8px;align-items:center">
      <input type="text" value="${f.month}" placeholder="月份" data-fi="${i}" data-ff="month" onchange="updateForecast(this)">
      <input type="text" value="${f.traffic}" placeholder="客流" data-fi="${i}" data-ff="traffic" onchange="updateForecast(this)">
      <input type="text" value="${f.growth}" placeholder="环比" data-fi="${i}" data-ff="growth" onchange="updateForecast(this)">
      <input type="text" value="${f.level}" placeholder="等级" data-fi="${i}" data-ff="level" onchange="updateForecast(this)">
      <input type="text" value="${f.factor}" placeholder="驱动因素" data-fi="${i}" data-ff="factor" onchange="updateForecast(this)">
      <button class="btn btn-sm btn-secondary" onclick="removeForecast(${i})">×</button>
    </div>
  `).join('') + `<button class="btn btn-sm btn-secondary" onclick="addForecast()">+ 添加预测</button>`;
}
function updateForecast(el) { state.storeData.forecast[Number(el.dataset.fi)][el.dataset.ff] = el.value; }
function removeForecast(i) { state.storeData.forecast.splice(i,1); renderForecastForm(); }
function addForecast() { state.storeData.forecast.push({month:'',traffic:'',growth:'',level:'',factor:''}); renderForecastForm(); }

function renderSegmentsForm() {
  const c = document.getElementById('segmentsList');
  const segs = state.storeData.customerProfile.segments;
  c.innerHTML = segs.map((s,i) => `
    <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">
      <input type="text" value="${s.label}" style="flex:1" onchange="state.storeData.customerProfile.segments[${i}].label=this.value">
      <input type="number" value="${s.pct}" style="width:70px" onchange="state.storeData.customerProfile.segments[${i}].pct=Number(this.value)||0">
      <span style="font-size:13px;color:var(--text2)">%</span>
    </div>
  `).join('');
}

function renderPreferencesForm() {
  const c = document.getElementById('preferencesList');
  const prefs = state.storeData.customerProfile.preferences;
  c.innerHTML = prefs.map((p,i) => `
    <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">
      <input type="text" value="${p.label}" style="flex:1" onchange="state.storeData.customerProfile.preferences[${i}].label=this.value">
      <input type="number" value="${p.pct}" style="width:70px" onchange="state.storeData.customerProfile.preferences[${i}].pct=Number(this.value)||0">
      <span style="font-size:13px;color:var(--text2)">%</span>
    </div>
  `).join('');
}

function renderAgeForm() {
  const c = document.getElementById('ageList');
  const ages = state.storeData.customerProfile.age;
  c.innerHTML = ages.map((a,i) => `
    <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">
      <input type="text" value="${a.label}" style="flex:1" onchange="state.storeData.customerProfile.age[${i}].label=this.value">
      <input type="number" value="${a.pct}" style="width:70px" onchange="state.storeData.customerProfile.age[${i}].pct=Number(this.value)||0">
      <span style="font-size:13px;color:var(--text2)">%</span>
    </div>
  `).join('');
}

function renderHeatmapForm() {
  const c = document.getElementById('heatmapEditor');
  const days = ['周一','周二','周三','周四','周五','周六','周日'];
  const rows = [
    {key:'lunch',label:'午餐'},
    {key:'tea',label:'下午茶'},
    {key:'dinner',label:'晚餐'},
    {key:'latesnack',label:'夜宵'}
  ];
  const hmColors = ['#e2e8f0','#dbeafe','#bfdbfe','#93c5fd','#60a5fa','#3b82f6','#fbbf24','#f59e0b','#f97316','#ef4444','#dc2626'];

  let html = '<div class="heatmap-grid">';
  html += '<div class="hm-header"></div>';
  days.forEach(d => html += `<div class="hm-header">${d}</div>`);
  rows.forEach(row => {
    html += `<div class="hm-label">${row.label}</div>`;
    for (let j = 0; j < 7; j++) {
      const v = state.storeData.heatmap[row.key][j] || 0;
      html += `<div class="hm-cell" style="background:${hmColors[v]};color:${v>5?'#fff':'#334155'}" onclick="cycleHeatmap(this,'${row.key}',${j})" title="${days[j]} ${row.label}: ${v}">${v}</div>`;
    }
  });
  html += '</div>';
  html += '<div class="hm-legend">低 ';
  hmColors.forEach((c,i) => html += `<div class="hm-swatch" style="background:${c}"></div>`);
  html += ' 高（点击切换 0-10）</div>';
  c.innerHTML = html;
}

function cycleHeatmap(el, key, idx) {
  const hmColors = ['#e2e8f0','#dbeafe','#bfdbfe','#93c5fd','#60a5fa','#3b82f6','#fbbf24','#f59e0b','#f97316','#ef4444','#dc2626'];
  let v = state.storeData.heatmap[key][idx];
  v = (v + 1) % 11;
  state.storeData.heatmap[key][idx] = v;
  el.style.background = hmColors[v];
  el.style.color = v > 5 ? '#fff' : '#334155';
  el.textContent = v;
  el.title = el.title.replace(/\d+$/, v);
}

function renderInsightsForm() {
  const c = document.getElementById('insightsList');
  c.innerHTML = state.storeData.insights.map((ins, i) => `
    <div class="insight-item" style="border-left-color:${ins.color}">
      <input class="insight-title-input" type="text" value="${escHtml(ins.title)}" placeholder="发现标题"
        onchange="state.storeData.insights[${i}].title=this.value">
      <textarea rows="3" placeholder="详细内容（优先植入高德卖点话术）"
        onchange="state.storeData.insights[${i}].content=this.value">${escHtml(ins.content)}</textarea>
      <div style="display:flex;gap:6px;align-items:center;margin-top:4px">
        <label style="font-size:12px;color:var(--text2)">颜色</label>
        <input type="color" value="${ins.color}" style="width:32px;height:24px;border:none;cursor:pointer"
          onchange="state.storeData.insights[${i}].color=this.value;this.parentElement.parentElement.style.borderLeftColor=this.value">
      </div>
    </div>
  `).join('');
}

function renderCompetitorsForm() {
  const c = document.getElementById('competitorsTable');
  const comps = state.storeData.competitors;
  let html = '<table class="comp-table-edit"><thead><tr><th>名称</th><th>评分</th><th>人均</th><th>业态</th><th>距离</th><th>竞争优势</th><th></th></tr></thead><tbody>';
  comps.forEach((comp, i) => {
    html += `<tr>
      <td><input value="${escHtml(comp.name)}" onchange="state.storeData.competitors[${i}].name=this.value"></td>
      <td><input value="${escHtml(comp.rating)}" onchange="state.storeData.competitors[${i}].rating=this.value"></td>
      <td><input value="${escHtml(comp.avgPrice)}" onchange="state.storeData.competitors[${i}].avgPrice=this.value"></td>
      <td><input value="${escHtml(comp.type)}" onchange="state.storeData.competitors[${i}].type=this.value"></td>
      <td><input value="${escHtml(comp.distance)}" onchange="state.storeData.competitors[${i}].distance=this.value"></td>
      <td><input value="${escHtml(comp.advantage)}" onchange="state.storeData.competitors[${i}].advantage=this.value"></td>
      <td><button class="btn btn-sm btn-secondary" onclick="removeCompetitor(${i})">×</button></td>
    </tr>`;
  });
  html += '</tbody></table>';
  html += '<button class="btn btn-sm btn-secondary" onclick="addCompetitor()" style="margin-top:8px">+ 添加竞品</button>';
  c.innerHTML = html;
}
function removeCompetitor(i) { state.storeData.competitors.splice(i,1); renderCompetitorsForm(); }
function addCompetitor() { state.storeData.competitors.push({name:'',rating:'',avgPrice:'',type:'',distance:'',advantage:''}); renderCompetitorsForm(); }

// ── Collect Form Data ──
function collectFormData() {
  const d = state.storeData;
  d.store.name = gv('storeName');
  d.store.address = gv('storeAddress');
  d.store.coords = gv('storeCoords');
  d.store.tags = gv('storeTags');
  d.store.rating = gv('storeRating');
  d.store.avgPrice = gv('storeAvgPrice');
  d.store.hours = gv('storeHours');
  d.store.analysisRange = gv('analysisRange');

  d.poi.seafood = gv('poiSeafood');
  d.poi.bbq = gv('poiBbq');
  d.poi.stirfry = gv('poiStirfry');
  d.poi.bus = gv('poiBus');
  d.poi.residential = gv('poiResidential');
  d.poi.office = gv('poiOffice');
  d.poi.mall = gv('poiMall');
  d.poi.avgRating = gv('poiAvgRating');

  d.customerProfile.malePct = Number(gv('genderMale')) || 0;
  d.customerProfile.femalePct = Number(gv('genderFemale')) || 0;
}

function gv(id) { const el = document.getElementById(id); return el ? el.value : ''; }

// ── Data Completeness ──
function updateCompleteness() {
  const d = state.storeData;
  if (!d) return;
  let total = 0, filled = 0;
  // Store info: 8 fields
  Object.values(d.store).forEach(v => { total++; if (v) filled++; });
  // POI: 8 fields
  Object.values(d.poi).forEach(v => { total++; if (v && v !== '0') filled++; });
  // Traffic
  d.monthlyTraffic.forEach(m => { total++; if (m.value > 0) filled++; });
  // Heatmap
  ['lunch','tea','dinner','latesnack'].forEach(k => d.heatmap[k].forEach(v => { total++; if (v > 0) filled++; }));
  // Insights
  d.insights.forEach(ins => { total++; if (ins.title) filled++; });

  const pct = Math.round(filled / total * 100);
  document.getElementById('dataCompleteness').style.display = 'flex';
  document.querySelector('.completeness-fill').style.width = pct + '%';
  document.querySelector('.completeness span:last-child').textContent = `数据完整度 ${pct}%`;
}

// ── Preview ──
function renderPreview() {
  const html = generateReportHTML(state.storeData);
  document.getElementById('reportPreview').srcdoc = html;
}

// ── Generate & Download ──
function generateAndDownload() {
  collectFormData();
  const html = generateReportHTML(state.storeData);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.storeData.store.name || '门店'}-流量分析报告.html`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('报告已生成并下载', 'success');
}

// ── Utilities ──
function showToast(msg, type='info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 3000);
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}


/* ===========================================
   REPORT HTML GENERATOR (Template)
   =========================================== */

function generateReportHTML(d) {
  const storeName = d.store.name || '门店';
  const now = new Date().toLocaleDateString('zh-CN');
  const maxTraffic = Math.max(...d.monthlyTraffic.map(m => m.value), 1);

  // POI stats
  const poiCards = [
    {label:'海鲜酒楼', value:d.poi.seafood||0, color:'#2563eb', icon:'🦐'},
    {label:'烧烤店', value:d.poi.bbq||0, color:'#dc2626', icon:'🔥'},
    {label:'炒菜馆', value:d.poi.stirfry||0, color:'#d97706', icon:'🍳'},
    {label:'公交站', value:d.poi.bus||0, color:'#16a34a', icon:'🚌'},
    {label:'住宅小区', value:d.poi.residential||0, color:'#7c3aed', icon:'🏠'},
    {label:'写字楼', value:d.poi.office||0, color:'#0891b2', icon:'🏢'},
    {label:'商场', value:d.poi.mall||0, color:'#e11d48', icon:'🏬'},
    {label:'均分', value:d.poi.avgRating||'-', color:'#64748b', icon:'⭐'}
  ];

  // Pie chart segments
  const segColors = ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7'];
  const prefColors = ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7'];
  let segGradient = '', prefGradient = '';
  let segLegend = '', prefLegend = '';
  let segAccum = 0, prefAccum = 0;

  d.customerProfile.segments.forEach((s, i) => {
    const start = segAccum; segAccum += s.pct;
    segGradient += `${segColors[i%5]} ${start}% ${segAccum}%${i < d.customerProfile.segments.length-1 ? ',' : ''}`;
    segLegend += `<div class="legend-item"><span class="legend-dot" style="background:${segColors[i%5]}"></span>${s.label} ${s.pct}%</div>`;
  });

  d.customerProfile.preferences.forEach((p, i) => {
    const start = prefAccum; prefAccum += p.pct;
    prefGradient += `${prefColors[i%5]} ${start}% ${prefAccum}%${i < d.customerProfile.preferences.length-1 ? ',' : ''}`;
    prefLegend += `<div class="legend-item"><span class="legend-dot" style="background:${prefColors[i%5]}"></span>${p.label} ${p.pct}%</div>`;
  });

  // Age bars
  const ageColors = ['#93c5fd','#60a5fa','#3b82f6','#2563eb','#1d4ed8'];
  let ageBars = '';
  d.customerProfile.age.forEach((a, i) => {
    ageBars += `<div class="age-bar-item"><div class="age-label">${a.label}</div><div class="age-bar-wrap"><div class="age-bar" style="width:${a.pct}%;background:${ageColors[i%5]}">${a.pct}%</div></div></div>`;
  });

  // Heatmap
  const hmColors = ['#e2e8f0','#dbeafe','#bfdbfe','#93c5fd','#60a5fa','#3b82f6','#fbbf24','#f59e0b','#f97316','#ef4444','#dc2626'];
  const days = ['周一','周二','周三','周四','周五','周六','周日'];
  const hmRows = [{key:'lunch',label:'午餐'},{key:'tea',label:'下午茶'},{key:'dinner',label:'晚餐'},{key:'latesnack',label:'夜宵'}];
  let heatmapCells = '<div class="heatmap-row"><div class="heatmap-label"></div>';
  days.forEach(d => heatmapCells += `<div class="heatmap-cell hm-header">${d}</div>`);
  heatmapCells += '</div>';
  hmRows.forEach(row => {
    heatmapCells += `<div class="heatmap-row"><div class="heatmap-label">${row.label}</div>`;
    d.heatmap[row.key].forEach((v, j) => {
      const c = hmColors[Math.min(10, Math.max(0, v))];
      heatmapCells += `<div class="heatmap-cell" style="background:${c};color:${v>5?'#fff':'#334155'}">${v > 0 ? v : '-'}</div>`;
    });
    heatmapCells += '</div>';
  });

  // Insights
  let insightsHtml = '';
  d.insights.filter(ins => ins.title || ins.content).forEach(ins => {
    insightsHtml += `<div class="insight-box" style="border-left-color:${ins.color}"><h4 style="color:${ins.color}">${ins.title}</h4><p>${ins.content}</p></div>`;
  });

  // Competitors
  let compRows = '';
  d.competitors.filter(c => c.name).forEach(c => {
    compRows += `<tr><td>${c.name}</td><td>⭐ ${c.rating}</td><td>¥${c.avgPrice}</td><td>${c.type}</td><td>${c.distance}</td><td><span class="tag">${c.advantage}</span></td></tr>`;
  });

  // Monthly traffic bars
  let trafficBars = '';
  d.monthlyTraffic.forEach(m => {
    const pct = maxTraffic > 0 ? Math.round(m.value / maxTraffic * 100) : 0;
    trafficBars += `<div class="css-chart-item"><div class="css-chart-label">${m.month}</div><div class="css-chart-bar-wrap"><div class="css-chart-bar" style="width:${pct}%">${m.value > 0 ? m.value.toLocaleString() : ''}</div></div></div>`;
  });

  // Forecast table
  let forecastRows = '';
  d.forecast.filter(f => f.month).forEach(f => {
    const levelClass = f.level === '高' ? 'tag ok' : f.level === '低' ? 'tag warn' : 'tag';
    forecastRows += `<tr><td>${f.month}</td><td>${Number(f.traffic).toLocaleString()}</td><td>${f.growth}%</td><td><span class="${levelClass}">${f.level}</span></td><td>${f.factor}</td></tr>`;
  });

  // Gender
  const { malePct, femalePct } = d.customerProfile;

  // Tags
  const tagList = (d.store.tags || '').split(/[,，]/).filter(Boolean);
  let tagsHtml = tagList.map(t => `<span class="tag">${t.trim()}</span>`).join(' ');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${storeName} 深度流量分析报告</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;background:#f0f4f8;color:#334155;line-height:1.7;padding:20px}
.report-wrap{max-width:900px;margin:0 auto}
.card{background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0;box-shadow:0 4px 20px rgba(0,0,0,.06);margin-bottom:20px}
.section{margin-bottom:25px}
.section-title{font-size:18px;font-weight:700;color:#d97706;margin-bottom:16px;padding-left:12px;border-left:4px solid #d97706}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px}
@media(max-width:768px){.two-col{grid-template-columns:1fr}}

/* Header card */
.header-card{text-align:center;padding:32px 24px;background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);color:#fff;border:none}
.header-card h1{font-size:24px;margin-bottom:8px}
.header-card .subtitle{font-size:14px;opacity:.85}

/* Store info table */
.info-table{width:100%;border-collapse:collapse}
.info-table td{padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px}
.info-table td:first-child{color:#64748b;width:120px;font-weight:500}

/* Stats grid */
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.stat-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center;transition:all .3s}
.stat-card:hover{transform:translateY(-3px);border-color:#d97706}
.stat-card .stat-icon{font-size:24px;margin-bottom:6px}
.stat-card .stat-num{font-size:28px;font-weight:700;color:#1e293b}
.stat-card .stat-label{font-size:12px;color:#64748b;margin-top:4px}

/* CSS Chart bars */
.css-chart-item{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.css-chart-label{width:40px;font-size:13px;color:#64748b;text-align:right;flex-shrink:0}
.css-chart-bar-wrap{flex:1;background:#e2e8f0;border-radius:6px;height:28px;overflow:hidden}
.css-chart-bar{height:100%;border-radius:6px;background:linear-gradient(90deg,#3b82f6,#2563eb);display:flex;align-items:center;justify-content:flex-end;padding-right:8px;font-size:12px;color:#fff;font-weight:500;min-width:0;transition:width .5s}

/* Forecast table */
.forecast-table{width:100%;border-collapse:collapse;font-size:13px}
.forecast-table th{background:#f8fafc;padding:10px;text-align:left;font-weight:600;color:#1e293b;border-bottom:2px solid #e2e8f0}
.forecast-table td{padding:10px;border-bottom:1px solid #f1f5f9}

/* Pie chart */
.pie-container{display:flex;align-items:center;gap:20px;flex-wrap:wrap;justify-content:center}
.pie-wrapper{position:relative;width:160px;height:160px;flex-shrink:0}
.pie{width:160px;height:160px;border-radius:50%;position:relative}
.pie-hole{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:80px;height:80px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center}
.pie-hole .num{font-size:16px;font-weight:700;color:#1e293b}
.pie-hole .label{font-size:11px;color:#64748b}
.legend{display:flex;flex-direction:column;gap:6px}
.legend-item{display:flex;align-items:center;gap:6px;font-size:13px}
.legend-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}

/* Age bars */
.age-bar-item{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.age-label{width:60px;font-size:12px;color:#64748b;text-align:right;flex-shrink:0}
.age-bar-wrap{flex:1;background:#e2e8f0;border-radius:4px;height:22px;overflow:hidden}
.age-bar{height:100%;border-radius:4px;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;font-size:11px;color:#fff;min-width:30px}

/* Gender */
.gender-container{display:flex;justify-content:center;gap:30px;padding:12px 0}
.gender-item{text-align:center}
.gender-item .gender-pct{font-size:28px;font-weight:700}
.gender-item .gender-label{font-size:13px;color:#64748b}

/* Heatmap */
.heatmap{display:grid;gap:3px}
.heatmap-row{display:grid;grid-template-columns:60px repeat(7,1fr);gap:3px}
.heatmap-cell{display:flex;align-items:center;justify-content:center;padding:8px 4px;border-radius:4px;font-size:12px;font-weight:500}
.heatmap-cell.hm-header{font-weight:600;color:#64748b;font-size:11px}
.heatmap-label{font-size:12px;color:#64748b;display:flex;align-items:center;justify-content:flex-end;padding-right:6px}

/* Insight boxes */
.insight-box{border-left:4px solid #2563eb;padding:16px 20px;margin-bottom:14px;background:#f8fafc;border-radius:0 10px 10px 0}
.insight-box h4{font-size:15px;margin-bottom:8px}
.insight-box p{font-size:13px;line-height:1.8;color:#334155}

/* Tags */
.tag{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;background:#dbeafe;color:#2563eb;margin:2px}
.tag.ok{background:#dcfce7;color:#16a34a}
.tag.warn{background:#fef3c7;color:#d97706}
.tag.danger{background:#fee2e2;color:#dc2626}

/* Competitor table */
.comp-table{width:100%;border-collapse:collapse;font-size:13px}
.comp-table th{background:#f8fafc;padding:10px;text-align:left;font-weight:600;color:#1e293b;border-bottom:2px solid #e2e8f0}
.comp-table td{padding:10px;border-bottom:1px solid #f1f5f9}
.comp-table tr:hover{background:#f8fafc}

/* Copy button */
.copy-btn{position:fixed;bottom:24px;right:24px;padding:12px 24px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;box-shadow:0 4px 12px rgba(37,99,235,.3);z-index:100;transition:all .2s}
.copy-btn:hover{background:#1d4ed8;transform:translateY(-2px)}

/* Footer */
.report-footer{text-align:center;padding:20px;font-size:12px;color:#94a3b8}

@media(max-width:768px){
  body{padding:10px}
  .card{padding:16px}
  .heatmap-row{grid-template-columns:50px repeat(7,1fr)}
  .stats-grid{grid-template-columns:repeat(2,1fr)}
}
</style>
</head>
<body>
<div class="report-wrap" id="reportContent">

<!-- Header -->
<div class="card header-card">
  <h1>${storeName} 深度流量分析报告</h1>
  <div class="subtitle">${d.store.address || ''} | 分析范围：${d.store.analysisRange || '门店周边1km'} | 生成日期：${now}</div>
</div>

<!-- Module 1: Store Info -->
<div class="card section">
  <div class="section-title">门店基础信息</div>
  <table class="info-table">
    <tr><td>门店名称</td><td><strong style="color:#1e293b">${storeName}</strong></td></tr>
    <tr><td>地址</td><td>${d.store.address || '-'}</td></tr>
    <tr><td>坐标</td><td>${d.store.coords || '-'}</td></tr>
    <tr><td>业态标签</td><td>${tagsHtml || '-'}</td></tr>
    <tr><td>评分</td><td>${d.store.rating ? '⭐ ' + d.store.rating : '-'}</td></tr>
    <tr><td>人均消费</td><td>${d.store.avgPrice ? '¥' + d.store.avgPrice : '-'}</td></tr>
    <tr><td>营业时间</td><td>${d.store.hours || '-'}</td></tr>
    <tr><td>分析范围</td><td>${d.store.analysisRange || '-'}</td></tr>
  </table>
</div>

<!-- Module 2: POI Density -->
<div class="card section">
  <div class="section-title">周边POI竞争密度全景</div>
  <div class="stats-grid">
    ${poiCards.map(c => `<div class="stat-card"><div class="stat-icon">${c.icon}</div><div class="stat-num">${c.value}</div><div class="stat-label">${c.label}</div></div>`).join('')}
  </div>
</div>

<!-- Module 3: Monthly Traffic -->
<div class="card section">
  <div class="section-title">月度流量趋势</div>
  ${trafficBars || '<p style="color:#94a3b8;text-align:center">暂无数据</p>'}
</div>

<!-- Module 4: Forecast -->
<div class="card section">
  <div class="section-title">景区流量预测</div>
  ${forecastRows ? `<table class="forecast-table"><thead><tr><th>月份</th><th>预测客流</th><th>环比</th><th>等级</th><th>驱动因素</th></tr></thead><tbody>${forecastRows}</tbody></table>` : '<p style="color:#94a3b8;text-align:center">暂无数据</p>'}
</div>

<!-- Module 5: Customer Profile -->
<div class="card section">
  <div class="section-title">消费人群画像</div>
  <div class="two-col">
    <div>
      <h4 style="font-size:14px;color:#64748b;margin-bottom:12px;text-align:center">客群结构</h4>
      <div class="pie-container">
        <div class="pie-wrapper">
          <div class="pie" style="background:conic-gradient(${segGradient || '#e2e8f0 0% 100%'})"></div>
          <div class="pie-hole"><div class="num">100%</div><div class="label">客群构成</div></div>
        </div>
        <div class="legend">${segLegend || '<span style="color:#94a3b8">暂无数据</span>'}</div>
      </div>
    </div>
    <div>
      <h4 style="font-size:14px;color:#64748b;margin-bottom:12px;text-align:center">消费偏好</h4>
      <div class="pie-container">
        <div class="pie-wrapper">
          <div class="pie" style="background:conic-gradient(${prefGradient || '#e2e8f0 0% 100%'})"></div>
          <div class="pie-hole"><div class="num">100%</div><div class="label">消费偏好</div></div>
        </div>
        <div class="legend">${prefLegend || '<span style="color:#94a3b8">暂无数据</span>'}</div>
      </div>
    </div>
  </div>

  <div class="two-col" style="margin-top:24px">
    <div>
      <h4 style="font-size:14px;color:#64748b;margin-bottom:12px">年龄分布</h4>
      ${ageBars || '<p style="color:#94a3b8">暂无数据</p>'}
    </div>
    <div>
      <h4 style="font-size:14px;color:#64748b;margin-bottom:12px">性别分布</h4>
      <div class="gender-container">
        <div class="gender-item"><div class="gender-pct" style="color:#2563eb">${malePct}%</div><div class="gender-label">男性</div></div>
        <div class="gender-item"><div class="gender-pct" style="color:#e11d48">${femalePct}%</div><div class="gender-label">女性</div></div>
      </div>
    </div>
  </div>
</div>

<!-- Module 6: Heatmap -->
<div class="card section">
  <div class="section-title">时段消费热力分布</div>
  <div class="heatmap">${heatmapCells}</div>
</div>

<!-- Module 7: Insights -->
<div class="card section">
  <div class="section-title">核心发现与经营建议</div>
  ${insightsHtml || '<p style="color:#94a3b8;text-align:center">暂无数据</p>'}
</div>

<!-- Module 8: Competitors -->
<div class="card section">
  <div class="section-title">同街道竞品对比</div>
  ${compRows ? `<table class="comp-table"><thead><tr><th>名称</th><th>评分</th><th>人均</th><th>业态</th><th>距离</th><th>竞争优势</th></tr></thead><tbody>${compRows}</tbody></table>` : '<p style="color:#94a3b8;text-align:center">暂无数据</p>'}
</div>

</div>

<div class="report-footer">本报告由「门店流量分析报告生成器」自动生成 | ${now}</div>

<button class="copy-btn" onclick="copyReport()">📋 复制为图片</button>

<script>
function copyReport(){
  const el=document.getElementById('reportContent');
  if(typeof html2canvas==='undefined'){alert('html2canvas未加载');return}
  html2canvas(el,{scale:2,useCORS:true,backgroundColor:'#f0f4f8'}).then(canvas=>{
    canvas.toBlob(blob=>{
      try{navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
      const btn=document.querySelector('.copy-btn');btn.textContent='✅ 已复制';setTimeout(()=>btn.textContent='📋 复制为图片',2000);
      }catch(e){
        const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='门店报告.png';a.click();
        alert('剪贴板写入失败，已改为下载PNG');
      }
    });
  });
}
<\/script>
</body>
</html>`;
}
