// CVmatchbox tab.js — syncs with extension storage

document.addEventListener('DOMContentLoaded', function () {
  // Load saved data
  chrome.storage.local.get(['savedCV', 'settings', 'usage'], function (d) {
    if (d.savedCV) document.getElementById('cvArea').value = d.savedCV;
    var s = d.settings || {};
    if (s.apiKey) document.getElementById('apiKeyEl').value = s.apiKey;
    var u = d.usage || {};
    if (u.licenseKey) document.getElementById('licenseEl').value = u.licenseKey;
  });

  // Save CV
  document.getElementById('saveCVBtn').addEventListener('click', function () {
    var txt = document.getElementById('cvArea').value.trim();
    if (!txt) { alert('Please paste your CV text first.'); return; }
    chrome.storage.local.set({ savedCV: txt }, function () { flash('cvOk', '✓ CV saved! Switch to a job page and click Analyze in the popup.'); });
  });

  // Clear CV
  document.getElementById('clearCVBtn').addEventListener('click', function () {
    if (!confirm('Clear your saved CV?')) return;
    document.getElementById('cvArea').value = '';
    chrome.storage.local.set({ savedCV: '' });
  });

  // Save settings
  document.getElementById('saveSettingsBtn').addEventListener('click', function () {
    var apiKey  = document.getElementById('apiKeyEl').value.trim();
    var licKey  = document.getElementById('licenseEl').value.trim();
    chrome.storage.local.set({ settings: { apiKey: apiKey, currency: 'USD' } });
    var plan = detectPlan(licKey);
    if (plan && licKey) {
      chrome.storage.local.get('usage', function (d) {
        var u = d.usage || { total: 0 };
        u.plan = plan; u.licenseKey = licKey;
        chrome.storage.local.set({ usage: u }, function () { flash('settOk', '✓ ' + plan + ' plan activated!'); });
      });
    } else {
      flash('settOk', '✓ Settings saved!');
    }
  });
});

function detectPlan(key) {
  if (!key) return null;
  var k = key.toUpperCase().trim();
  if (k.startsWith('CVMB-S-')) return 'starter';
  if (k.startsWith('CVMB-P-')) return 'pro';
  if (k.startsWith('CVMB-A-')) return 'agency';
  return null;
}

function flash(id, msg) {
  var e = document.getElementById(id);
  if (!e) return;
  e.textContent = msg;
  e.style.display = 'block';
  setTimeout(function () { e.style.display = 'none'; }, 3000);
}
