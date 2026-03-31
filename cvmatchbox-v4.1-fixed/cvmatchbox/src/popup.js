// CVmatchbox v4.1 | By Minhal Haider
// Each feature is independent — one failure cannot break another

const STRIPE = {
  starter: 'https://buy.stripe.com/YOUR_STARTER_LINK',
  pro:     'https://buy.stripe.com/YOUR_PRO_LINK',
  agency:  'https://buy.stripe.com/YOUR_AGENCY_LINK',
};
const VERSION_URL = 'https://raw.githubusercontent.com/YOUR_USERNAME/cvmatchbox/main/version.json';
const FREE_LIMIT  = 50;
let currentJob = null;
let lastResult = null;

// ════════════════════════════════════════
// BOOT — each step wrapped independently
// ════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function () {
  // 1. Wire tabs — must work first, independently
  wireTabs();

  // 2. Wire all buttons — each independent try/catch
  wireButtons();

  // 3. Load saved data into UI
  loadUI();

  // 4. Detect job page (non-blocking)
  detectPage();

  // 5. Check for updates (non-blocking, never throws)
  checkUpdates();
});

// ════════════════════════════════════════
// TABS — simple, no async
// ════════════════════════════════════════
function wireTabs() {
  var tabs   = document.querySelectorAll('.tab-btn');
  var panels = document.querySelectorAll('.panel');

  tabs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); });
      panels.forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      var panel = document.getElementById('tab-' + btn.dataset.tab);
      if (panel) panel.classList.add('active');
      if (btn.dataset.tab === 'tracker') renderTracker();
    });
  });
}

// ════════════════════════════════════════
// WIRE ALL BUTTONS
// ════════════════════════════════════════
function wireButtons() {

  // Open in full tab
  safeOn('openTabBtn', 'click', function () {
    chrome.tabs.create({ url: chrome.runtime.getURL('tab.html') });
  });

  // Plan pill → Plans tab
  safeOn('planPill', 'click', function () { switchTab('plans'); });

  // Paywall plan cards
  document.querySelectorAll('.pw-card').forEach(function (c) {
    c.addEventListener('click', function () {
      document.querySelectorAll('.pw-card').forEach(function (x) { x.classList.remove('sel'); });
      c.classList.add('sel');
    });
  });

  // Upgrade button
  safeOn('upgradeBtn', 'click', function () {
    var sel = document.querySelector('.pw-card.sel');
    openCheckout(sel ? sel.dataset.plan : 'pro');
  });

  // Plan checkout buttons
  document.querySelectorAll('[data-checkout]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openCheckout(btn.dataset.checkout);
    });
  });

  // Analyze button
  safeOn('analyzeBtn', 'click', runAnalysis);

  // Try again
  safeOn('tryAgainBtn', 'click', resetForm);

  // New analysis
  safeOn('newAnalysisBtn', 'click', resetForm);

  // Save job to tracker
  safeOn('saveJobBtn', 'click', saveToTracker);

  // Save CV
  safeOn('saveCVBtn', 'click', function () {
    var txt = el('cvArea').value.trim();
    if (!txt) { alert('Please paste your CV text first.'); return; }
    chrome.storage.local.set({ savedCV: txt }, function () {
      el('noCVWarn').style.display = 'none';
      flashOk('cvOk', '✓ CV saved!');
    });
  });

  // Clear CV
  safeOn('clearCVBtn', 'click', function () {
    if (!confirm('Clear your saved CV?')) return;
    el('cvArea').value = '';
    chrome.storage.local.set({ savedCV: '' });
  });

  // Clear jobs
  safeOn('clearJobsBtn', 'click', function () {
    if (!confirm('Clear all saved jobs?')) return;
    chrome.storage.local.set({ savedJobs: [] }, renderTracker);
  });

  // Save settings
  safeOn('saveSettingsBtn', 'click', saveSettings);
}

// ════════════════════════════════════════
// LOAD UI from storage
// ════════════════════════════════════════
function loadUI() {
  chrome.storage.local.get(['savedCV', 'settings', 'usage', 'meta'], function (data) {
    // CV
    if (data.savedCV) el('cvArea').value = data.savedCV;

    // Settings
    var s = data.settings || {};
    if (s.apiKey)   el('apiKeyEl').value   = s.apiKey;
    if (s.currency) el('currencyEl').value = s.currency;

    // License key
    var u = data.usage || {};
    if (u.licenseKey) el('licenseEl').value = u.licenseKey;

    // Plan pill
    refreshPlanPill(u.plan || 'free');

    // Usage bar
    refreshUsageBar(u);

    // Day count
    var today = new Date().toDateString();
    var m = data.meta || {};
    el('todayEl').textContent = (m.date === today ? m.count : 0) || 0;
  });
}

// ════════════════════════════════════════
// DETECT PAGE
// ════════════════════════════════════════
function detectPage() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs || !tabs[0]) return;
    var url = tabs[0].url || '';
    if (!isJobPage(url)) {
      showOnly('noJobEl');
      return;
    }
    showOnly('formEl');

    // Check CV warning
    chrome.storage.local.get('savedCV', function (d) {
      el('noCVWarn').style.display = d.savedCV ? 'none' : 'block';
    });

    // Quick scrape for banner
    chrome.scripting.executeScript(
      { target: { tabId: tabs[0].id }, func: quickScrape },
      function (res) {
        if (res && res[0] && res[0].result) {
          currentJob = res[0].result;
          showBanner(currentJob);
        }
      }
    );
  });
}

function isJobPage(url) {
  return /linkedin\.com\/jobs|indeed\.com|glassdoor\.com\/[Jj]ob|seek\.com/.test(url);
}

function quickScrape() {
  function getTitle() {
    var sels = ['h1[class*="title" i]', '.jobs-unified-top-card__job-title', '[data-test="job-title"]', '[data-automation="job-detail-title"]', 'h1'];
    for (var i = 0; i < sels.length; i++) {
      try { var e = document.querySelector(sels[i]); if (e && e.innerText.trim()) return e.innerText.trim().split('\n')[0]; } catch(x){}
    }
    return document.title.split('|')[0].split('-')[0].trim();
  }
  function getCompany() {
    var sels = ['[data-automation="advertiser-name"]', '[class*="companyName" i]', '.jobs-unified-top-card__company-name', '[class*="company" i]'];
    for (var i = 0; i < sels.length; i++) {
      try { var e = document.querySelector(sels[i]); if (e && e.innerText.trim()) return e.innerText.trim().split('\n')[0]; } catch(x){}
    }
    return '';
  }
  var h = location.hostname;
  return {
    jobTitle: getTitle(), company: getCompany(), url: location.href,
    platform: h.includes('linkedin') ? 'LinkedIn' : h.includes('indeed') ? 'Indeed' : h.includes('glassdoor') ? 'Glassdoor' : h.includes('seek') ? 'Seek' : 'Unknown'
  };
}

function showBanner(d) {
  var platClass = { LinkedIn:'jb-li', Indeed:'jb-in', Glassdoor:'jb-gl', Seek:'jb-se' }[d.platform] || 'jb-un';
  el('platEl').textContent = d.platform;
  el('platEl').className   = 'jb-plat ' + platClass;
  el('jTitleEl').textContent = d.jobTitle || 'Job Listing';
  el('jCoEl').textContent    = d.company || '';
  el('jobBanner').style.display = 'block';
}

// ════════════════════════════════════════
// ANALYZE
// ════════════════════════════════════════
function runAnalysis() {
  chrome.storage.local.get(['settings', 'savedCV', 'usage'], function (data) {
    var s   = data.settings || {};
    var cv  = data.savedCV  || '';
    var u   = data.usage    || {};

    if (!s.apiKey) {
      switchTab('settings');
      alert('Please add your free Groq API key in Settings.\nGet one at console.groq.com');
      return;
    }

    // Check limit
    var plan  = u.plan  || 'free';
    var total = u.total || 0;
    var limit = (plan === 'pro' || plan === 'agency') ? Infinity : plan === 'starter' ? 200 : FREE_LIMIT;
    if (total >= limit) { showOnly('paywallEl'); return; }

    setLoading('Reading job description…', 'Detecting keywords');

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs || !tabs[0]) { showErr('No active tab found.'); return; }

      var tab = tabs[0];
      if (!isJobPage(tab.url || '')) {
        showErr('Please navigate to a job listing page first (LinkedIn, Indeed, Glassdoor, or Seek).');
        return;
      }

      chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fullScrape }, function (res) {
        if (chrome.runtime.lastError || !res || !res[0] || !res[0].result) {
          showErr('Could not read the page. Make sure you are on the job detail page (not search results) and the description is fully loaded.');
          return;
        }

        var jobData = res[0].result;
        if (!jobData.jobText || jobData.jobText.length < 80) {
          showErr('Job description not found. Scroll down to load the full description, then try again.');
          return;
        }

        currentJob = jobData;
        showBanner(jobData);
        setLoading('Analyzing with AI…', 'Comparing CV to job requirements');

        chrome.storage.local.get('settings', function (sd) {
          callGroq(jobData.jobText, cv, sd.settings || {}, function (err, result) {
            if (err) { showErr(err); return; }

            lastResult = result;

            // Record usage
            var nu = data.usage || { total: 0, plan: 'free' };
            nu.total = (nu.total || 0) + 1;
            chrome.storage.local.set({ usage: nu });
            bumpDayCount();
            refreshUsageBar(nu);

            showResults(result, !!cv);
          });
        });
      });
    });
  });
}

// Full scraper
function fullScrape() {
  var host = location.hostname;
  function tryS(sels) {
    for (var i = 0; i < sels.length; i++) {
      try {
        var els = document.querySelectorAll(sels[i]);
        for (var j = 0; j < els.length; j++) {
          var t = (els[j].innerText || '').trim();
          if (t.length > 150) return t;
        }
      } catch(x) {}
    }
    return null;
  }
  var jt = null;
  if (host.includes('linkedin')) jt = tryS(['.jobs-description__content .jobs-box__html-content','.jobs-description__content','.jobs-description','[class*="jobs-description"]','#job-details']);
  else if (host.includes('indeed')) jt = tryS(['#jobDescriptionText','[data-testid="jobDescriptionText"]','.jobsearch-jobDescriptionText','[class*="JobDescription"]','[class*="jobDescription"]']);
  else if (host.includes('glassdoor')) jt = tryS(['[class*="JobDetails_jobDescription"]','[class*="jobDescription"]','[class*="JobDescription"]','[data-test="jobDescriptionContent"]','.desc','[class*="empDesc"]','section[class*="description"]','div[class*="description"]']);
  else if (host.includes('seek')) jt = tryS(['[data-automation="jobAdDetails"]','[data-automation="jobDescription"]','[class*="jobDescription"]','article']);

  if (!jt || jt.length < 150) {
    var best = '', bestScore = 0;
    var allEls = document.querySelectorAll('div,section,article,main');
    for (var i = 0; i < allEls.length; i++) {
      var e = allEls[i];
      var t = (e.innerText || '').trim();
      if (t.length < 200 || t.length > 30000) continue;
      if (['NAV','HEADER','FOOTER','SCRIPT','STYLE'].indexOf(e.tagName) > -1) continue;
      var cls = ((e.className || '') + ' ' + (e.id || '')).toLowerCase();
      var score = t.length;
      if (cls.match(/desc|job|detail|content|posting|summary|require/)) score *= 2.5;
      if (cls.match(/nav|menu|sidebar|header|footer|ad|banner|cookie|modal/)) score *= 0.05;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    jt = best || (document.body.innerText || '').slice(0, 12000);
  }

  function getTitle() {
    var sels = ['[data-automation="job-detail-title"]','[data-test="job-title"]','.jobs-unified-top-card__job-title','.jobsearch-JobInfoHeader-title','h1[class*="title" i]','h1'];
    for (var i = 0; i < sels.length; i++) { try { var e = document.querySelector(sels[i]); if (e && e.innerText.trim()) return e.innerText.trim().split('\n')[0]; } catch(x){} }
    return document.title.split('|')[0].split('-')[0].trim();
  }
  function getCompany() {
    var sels = ['[data-automation="advertiser-name"]','[class*="companyName" i]','[class*="employer" i]','.jobs-unified-top-card__company-name','[class*="company" i]'];
    for (var i = 0; i < sels.length; i++) { try { var e = document.querySelector(sels[i]); if (e && e.innerText.trim()) return e.innerText.trim().split('\n')[0]; } catch(x){} }
    return '';
  }

  var platform = host.includes('linkedin') ? 'LinkedIn' : host.includes('indeed') ? 'Indeed' : host.includes('glassdoor') ? 'Glassdoor' : host.includes('seek') ? 'Seek' : 'Unknown';
  return { jobText: jt.trim(), jobTitle: getTitle(), company: getCompany(), platform: platform, url: location.href };
}

// ════════════════════════════════════════
// GROQ API — callback style (no async/await issues)
// ════════════════════════════════════════
function callGroq(jobText, cv, settings, callback) {
  var job = jobText.slice(0, 5000);
  var cvTx = cv ? cv.slice(0, 3000) : '';
  var cur  = (settings && settings.currency) || 'USD';

  var cvSection = cvTx
    ? '\nCANDIDATE CV:\n' + cvTx
    : '\nNO CV PROVIDED — set matchScore to -1, missingSkills=[], presentSkills=[], qualificationMatch=[].';

  var prompt = 'You are a senior career analyst. Analyze the job posting below and return ONLY a valid JSON object. No markdown, no explanation — raw JSON only.\n\nJOB POSTING:\n' + job + '\n' + cvSection + '\n\nReturn this EXACT JSON:\n{\n  "jobTitle": "exact job title",\n  "jobSummary": "2-sentence summary of this role",\n  "keywords": [{"word":"Python","priority":"high"},{"word":"Agile","priority":"medium"},{"word":"communication","priority":"low"}],\n  "topSkills": [{"name":"Python","frequency":90},{"name":"SQL","frequency":75}],\n  "qualificationMatch": [{"requirement":"Bachelor degree","icon":"🎓","status":"met","note":"brief note"}],\n  "missingSkills": ["skill1","skill2"],\n  "presentSkills": ["skill1","skill2"],\n  "matchScore": 72,\n  "matchReason": "one sentence explaining the score",\n  "salaryMin": 60000,\n  "salaryMax": 90000,\n  "salaryCurrency": "' + cur + '",\n  "salaryNote": "Market estimate",\n  "resumeTips": [{"icon":"📝","text":"tip"},{"icon":"🎯","text":"tip"},{"icon":"💡","text":"tip"}]\n}\n\nRULES: keywords 10-15; topSkills 6-8 with frequency 0-100; matchScore 0-100 if CV else -1; salaryMin/Max annual in ' + cur + '; resumeTips exactly 3. Return ONLY JSON.';

  fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + settings.apiKey },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 1500, temperature: 0.15 })
  })
  .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
  .then(function (res) {
    if (!res.ok) { callback((res.d.error && res.d.error.message) || 'Groq API error'); return; }
    var raw = ((res.d.choices[0].message.content) || '').trim();
    var clean = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try { callback(null, JSON.parse(clean)); }
    catch(e) {
      var m = clean.match(/\{[\s\S]*\}/);
      if (m) { try { callback(null, JSON.parse(m[0])); return; } catch(e2){} }
      callback('AI returned unexpected format. Please try again.');
    }
  })
  .catch(function (e) { callback(e.message || 'Network error'); });
}

// ════════════════════════════════════════
// RENDER RESULTS
// ════════════════════════════════════════
function showResults(r, hasCV) {
  showOnly('resultsEl');

  // Summary
  if (r.jobSummary) {
    el('summaryBox').textContent = r.jobSummary;
    el('summaryBox').style.display = 'block';
  }

  // Ring
  var circ = 2 * Math.PI * 30;
  var ring = el('ringFill');
  ring.style.strokeDasharray  = circ;
  ring.style.strokeDashoffset = circ;

  if (!hasCV || r.matchScore < 0) {
    el('ringNum').textContent  = '—';
    el('matchPct').textContent = '—';
    el('matchReason').textContent = 'Save your CV in "My CV" tab to get a match score.';
    el('matchLbl').textContent = 'No CV';
  } else {
    var s = Math.max(0, Math.min(100, parseInt(r.matchScore) || 0));
    el('ringNum').textContent  = s + '%';
    el('matchPct').textContent = s + '%';
    el('matchReason').textContent = r.matchReason || '';
    el('matchLbl').textContent = s >= 70 ? '🟢 Strong' : s >= 45 ? '🟡 Decent' : '🔴 Weak';
    setTimeout(function () { ring.style.strokeDashoffset = circ - (s / 100) * circ; }, 120);
  }

  // Stats
  var miss = arr(r.missingSkills);
  var have = arr(r.presentSkills);
  var kws  = arr(r.keywords);
  el('stHave').textContent = hasCV ? have.length : '—';
  el('stMiss').textContent = hasCV ? miss.length : '—';
  el('stKw').textContent   = kws.length;

  // Keywords
  el('kwBadge').textContent = kws.length + ' found';
  el('kwGrid').innerHTML = kws.length
    ? kws.map(function (k) { return '<span class="kw ' + (k.priority==='high'?'kw-h':k.priority==='medium'?'kw-m':'kw-l') + '">' + k.word + '</span>'; }).join('')
    : '<span style="color:var(--muted);font-size:12px">None found.</span>';

  // Skill bars
  var skills = arr(r.topSkills);
  el('skillBars').innerHTML = skills.length
    ? skills.map(function (s) { return '<div class="skill-row"><span class="sn" title="' + s.name + '">' + s.name + '</span><div class="bar-bg"><div class="bar-fill" data-w="' + s.frequency + '%" style="width:0"></div></div><span class="sp">' + s.frequency + '%</span></div>'; }).join('')
    : '<span style="color:var(--muted);font-size:12px">None found.</span>';
  setTimeout(function () {
    el('skillBars').querySelectorAll('.bar-fill').forEach(function (b) { b.style.width = b.dataset.w; });
  }, 100);

  // Qual
  var quals = arr(r.qualificationMatch);
  el('qualDiv').innerHTML = (!hasCV || !quals.length)
    ? '<span style="color:var(--muted);font-size:12px">Save your CV to see qualification matching.</span>'
    : quals.map(function (q) {
        var cls = q.status==='met'?'qs-met':q.status==='partial'?'qs-part':'qs-miss';
        var lbl = q.status==='met'?'✓ Met':q.status==='partial'?'~ Partial':'✗ Missing';
        return '<div class="qual-row"><span style="font-size:15px;flex-shrink:0;margin-top:1px">' + (q.icon||'📋') + '</span><div style="flex:1;line-height:1.5"><strong>' + q.requirement + '</strong>' + (q.note ? '<br><span style="color:var(--muted);font-size:11px">' + q.note + '</span>' : '') + '</div><span class="qs ' + cls + '">' + lbl + '</span></div>';
      }).join('');

  // Gaps
  el('gapDiv').innerHTML = !hasCV
    ? '<span style="color:var(--muted);font-size:12px">Save your CV to see skill gaps.</span>'
    : (function () {
        var h = '';
        if (miss.length) h += '<div class="gap-sec"><div class="gap-lbl" style="color:var(--red)">❌ Missing (' + miss.length + ')</div><div class="chips">' + miss.map(function(x){return '<span class="chip c-miss">'+x+'</span>';}).join('') + '</div></div>';
        if (have.length) h += '<div class="gap-sec"><div class="gap-lbl" style="color:var(--green)">✅ You have (' + have.length + ')</div><div class="chips">' + have.map(function(x){return '<span class="chip c-have">'+x+'</span>';}).join('') + '</div></div>';
        return h || '<span style="color:var(--muted);font-size:12px">No gaps found.</span>';
      })();

  // Salary
  var sym = {USD:'$',PKR:'₨',GBP:'£',EUR:'€',AED:'AED ',SAR:'SAR ',AUD:'A$',CAD:'C$'}[r.salaryCurrency] || '$';
  var fmt = function(n) { return n >= 1000 ? (n/1000).toFixed(0)+'k' : (n||0); };
  el('salBig').textContent  = sym + fmt(r.salaryMin) + ' – ' + sym + fmt(r.salaryMax) + '/yr';
  el('salNote').textContent = r.salaryNote || '';

  // Tips
  var tips = arr(r.resumeTips);
  el('tipsDiv').innerHTML = tips.length
    ? tips.map(function (t) { return '<div class="tip-row"><span style="flex-shrink:0">' + (t.icon||'💡') + '</span><span>' + t.text + '</span></div>'; }).join('')
    : '<span style="color:var(--muted);font-size:12px">No tips.</span>';
}

// ════════════════════════════════════════
// TRACKER
// ════════════════════════════════════════
function saveToTracker() {
  if (!currentJob || !lastResult) return;
  chrome.storage.local.get('savedJobs', function (d) {
    var jobs = d.savedJobs || [];
    if (jobs.some(function (j) { return j.url === currentJob.url; })) {
      alert('This job is already saved.'); return;
    }
    jobs.unshift({ id: Date.now(), title: lastResult.jobTitle || currentJob.jobTitle || 'Unknown', company: currentJob.company||'—', platform: currentJob.platform||'—', url: currentJob.url||'', matchScore: lastResult.matchScore, status: 'saved', date: new Date().toLocaleDateString() });
    chrome.storage.local.set({ savedJobs: jobs }, function () {
      var btn = el('saveJobBtn');
      btn.textContent = '✅ Saved!';
      btn.disabled = true;
      setTimeout(function () { btn.textContent = '🔖 Save to Tracker'; btn.disabled = false; }, 2000);
    });
  });
}

function renderTracker() {
  chrome.storage.local.get('savedJobs', function (d) {
    var jobs = d.savedJobs || [];
    el('jCount').textContent = jobs.length;
    var listEl = el('jList');
    if (!jobs.length) { listEl.innerHTML = '<div class="t-empty">📌<br><br>No saved jobs yet.<br>Analyze a job and click "Save to Tracker".</div>'; return; }
    listEl.innerHTML = jobs.map(function (j) {
      return '<div class="jcard"><div class="jcard-top"><div class="jcard-title">' + j.title + '</div><select class="ssel ss-' + j.status + '" data-id="' + j.id + '"><option value="saved"' + (j.status==='saved'?' selected':'') + '>Saved</option><option value="applied"' + (j.status==='applied'?' selected':'') + '>Applied</option><option value="interview"' + (j.status==='interview'?' selected':'') + '>Interview</option><option value="rejected"' + (j.status==='rejected'?' selected':'') + '>Rejected</option></select><button class="del" data-id="' + j.id + '">✕</button></div><div class="jcard-meta">' + j.company + ' · ' + j.platform + ' · ' + j.date + '</div>' + (j.matchScore >= 0 ? '<div class="jcard-score">Match: ' + j.matchScore + '%</div>' : '') + '</div>';
    }).join('');

    // Wire status selects
    listEl.querySelectorAll('.ssel').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var id = parseInt(sel.dataset.id);
        sel.className = 'ssel ss-' + sel.value;
        chrome.storage.local.get('savedJobs', function (d2) {
          var jobs2 = d2.savedJobs || [];
          var i = jobs2.findIndex(function (j) { return j.id === id; });
          if (i >= 0) { jobs2[i].status = sel.value; chrome.storage.local.set({ savedJobs: jobs2 }); }
        });
      });
    });

    // Wire delete buttons
    listEl.querySelectorAll('.del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.dataset.id);
        chrome.storage.local.get('savedJobs', function (d2) {
          var filtered = (d2.savedJobs || []).filter(function (j) { return j.id !== id; });
          chrome.storage.local.set({ savedJobs: filtered }, renderTracker);
        });
      });
    });
  });
}

// ════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════
function saveSettings() {
  var apiKey   = el('apiKeyEl').value.trim();
  var currency = el('currencyEl').value;
  var licKey   = el('licenseEl').value.trim();

  chrome.storage.local.set({ settings: { apiKey: apiKey, currency: currency } }, function () {
    var plan = detectPlan(licKey);
    if (plan && licKey) {
      chrome.storage.local.get('usage', function (d) {
        var u = d.usage || { total: 0 };
        u.plan = plan; u.licenseKey = licKey;
        chrome.storage.local.set({ usage: u }, function () {
          refreshPlanPill(plan);
          refreshUsageBar(u);
          flashOk('settOk', '✓ ' + plan.charAt(0).toUpperCase() + plan.slice(1) + ' plan activated!');
        });
      });
    } else {
      flashOk('settOk', '✓ Settings saved!');
    }
  });
}

function detectPlan(key) {
  if (!key) return null;
  var k = key.toUpperCase().trim();
  if (k.startsWith('CVMB-S-')) return 'starter';
  if (k.startsWith('CVMB-P-')) return 'pro';
  if (k.startsWith('CVMB-A-')) return 'agency';
  return null;
}

// ════════════════════════════════════════
// PLAN & USAGE
// ════════════════════════════════════════
function refreshPlanPill(plan) {
  var pill = el('planPill');
  var map = { free:'Free', starter:'Starter ✓', pro:'Pro ✓', agency:'Agency ✓' };
  pill.textContent = map[plan] || 'Free';
  pill.className   = 'plan-pill pp-' + (plan || 'free');
}

function refreshUsageBar(u) {
  u = u || {};
  var plan  = u.plan  || 'free';
  var total = u.total || 0;
  if (plan === 'pro' || plan === 'agency') { el('usageBar').style.display = 'none'; return; }
  el('usageBar').style.display = 'flex';
  var lim  = plan === 'starter' ? 200 : FREE_LIMIT;
  var pct  = Math.min(100, (total / lim) * 100);
  el('uNum').textContent = total + '/' + lim;
  var fill = el('uFill');
  fill.style.width = pct + '%';
  fill.className   = 'u-fill' + (pct >= 100 ? ' over' : pct >= 80 ? ' warn' : '');
}

// ════════════════════════════════════════
// CHECKOUT
// ════════════════════════════════════════
function openCheckout(plan) {
  var url = STRIPE[plan];
  if (url && url.indexOf('YOUR_') === -1) {
    chrome.tabs.create({ url: url });
  } else {
    alert('Payment not set up yet.\n\nTo set up:\n1. Go to stripe.com\n2. Create a product for "' + plan + '"\n3. Generate a Payment Link\n4. Paste it in popup.js → STRIPE.' + plan);
  }
}

// ════════════════════════════════════════
// UPDATE CHECK
// ════════════════════════════════════════
function checkUpdates() {
  if (VERSION_URL.indexOf('YOUR_USERNAME') > -1) return;
  fetch(VERSION_URL + '?_=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.version && d.version !== '4.1.0') {
        var b = el('updateBanner');
        b.textContent = '🆕 Update v' + d.version + ': ' + (d.note || 'click to update') + ' →';
        b.style.display = 'block';
        b.onclick = function () { chrome.tabs.create({ url: d.updateUrl || '#' }); };
      }
    })
    .catch(function () {});
}

// ════════════════════════════════════════
// DAY COUNTER
// ════════════════════════════════════════
function bumpDayCount() {
  var today = new Date().toDateString();
  chrome.storage.local.get('meta', function (d) {
    var m = (d.meta && d.meta.date === today) ? d.meta : { date: today, count: 0 };
    m.count = (m.count || 0) + 1;
    chrome.storage.local.set({ meta: m }, function () {
      el('todayEl').textContent = m.count;
    });
  });
}

// ════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════
function el(id) { return document.getElementById(id); }
function arr(x)  { return Array.isArray(x) ? x : []; }

function safeOn(id, evt, fn) {
  var e = document.getElementById(id);
  if (e) e.addEventListener(evt, fn);
}

function showOnly(id) {
  ['noJobEl','formEl','loadEl','errEl','paywallEl','resultsEl'].forEach(function (x) {
    var e = document.getElementById(x);
    if (e) e.style.display = x === id ? '' : 'none';
  });
}

function setLoading(title, sub) {
  showOnly('loadEl');
  el('loadTitle').textContent = title || 'Loading…';
  el('loadSub').textContent   = sub   || '';
}

function showErr(msg) {
  showOnly('errEl');
  el('errMsg').textContent = msg;
}

function resetForm() {
  showOnly('formEl');
  if (currentJob) showBanner(currentJob);
  lastResult = null;
  el('summaryBox').style.display = 'none';
  var btn = el('saveJobBtn');
  if (btn) { btn.textContent = '🔖 Save to Tracker'; btn.disabled = false; }
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(function (t) { t.classList.toggle('active', t.dataset.tab === name); });
  document.querySelectorAll('.panel').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + name); });
}

function flashOk(id, msg) {
  var e = document.getElementById(id);
  if (!e) return;
  e.textContent = msg;
  e.style.display = 'block';
  setTimeout(function () { e.style.display = 'none'; }, 2500);
}
