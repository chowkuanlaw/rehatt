'use strict';
(function monitorIsland() {
  const api = window.kopi;
  if (!api?.aiMonitorGet) return;
  // English, or Bahasa Melayu when chosen in Settings → General → Language.
  const MS = () => window.__kopiPrefs?.().lang === 'ms', EN = () => !MS(), T = (ms, en) => MS() ? ms : en, LOCALE = () => MS() ? 'ms-MY' : 'en-GB';
  const names = { claudecode: 'Claude Code', codex: 'Codex' };
  // The two coding agents Rehatt follows (through their hooks): it nudges you when one has a question or is done.
  const PICKS = [['claudecode', 'Claude Code'], ['codex', 'Codex']];
  const colours = { running: '#ff9a1f', sending: '#ff9a1f', question: '#ff9a1f', error: '#ff3b3b',
    stopped: '#ff3b3b', unavailable: '#ff3b3b', done: '#22e05a', ready: '#b8c0b5',
    connecting: '#b8c0b5', disconnected: '#7e887a', login: '#7e887a' };
  const labels = { running: 'Working', sending: 'Sending', question: 'Question', error: 'Error', stopped: 'Stopped',
    unavailable: 'Unavailable', done: 'Done', ready: 'Ready', connecting: 'Connecting', disconnected: 'Not connected', login: 'Log in' };
  let state = { providers: Object.keys(names).map(provider => ({ provider, name: names[provider], state: 'disconnected', detail: 'Connect your conversation' })) };
  let selected = null, error = '', pending = false, lastSignature = '';
  const root = document.createElement('section'); root.id = 'kopi-ai-monitor'; document.body.appendChild(root);
  const statusReader = document.createElement('div'); statusReader.id = 'kopi-ai-monitor-status';
  statusReader.setAttribute('role', 'status'); statusReader.setAttribute('aria-live', 'polite'); document.body.appendChild(statusReader);
  const style = document.createElement('style'); style.textContent = `
#kopi-ai-monitor{position:absolute;z-index:60;display:none;color:#f4f7ef;font:12px/1.4 Arial,sans-serif;pointer-events:auto;user-select:text}
#kopi-ai-monitor *{box-sizing:border-box}
#kopi-ai-monitor-status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);pointer-events:none}
#kopi-ai-monitor .am-shell{height:100%;display:flex;flex-direction:column;gap:7px;min-height:0;padding-bottom:4px}
#kopi-ai-monitor .am-head{display:flex;align-items:center;gap:8px;flex:none}
#kopi-ai-monitor .am-head strong{font-size:17px;flex:1}
#kopi-ai-monitor .am-hint{color:#c2ccbd;font-size:11px}
#kopi-ai-monitor button{border:1px solid #394333;border-radius:12px;padding:7px 11px;color:#eef3e8;background:#252c22;font:600 11px Arial,sans-serif;cursor:pointer}
#kopi-ai-monitor button:hover{background:#343e2d}
#kopi-ai-monitor button:focus-visible,#kopi-ai-monitor textarea:focus-visible{outline:2px solid #c6e994;outline-offset:2px}
#kopi-ai-monitor button:disabled{opacity:.5;cursor:default}
#kopi-ai-monitor .am-primary{background:#c6e994;color:#172011;border-color:#c6e994}
#kopi-ai-monitor .am-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;align-content:center;flex:1;min-height:0}
#kopi-ai-monitor .am-card{text-align:left;border:1px solid #404939;border-radius:17px;background:#192016;padding:14px;display:flex;flex-direction:column;gap:8px;min-width:0;font-weight:400}
#kopi-ai-monitor .am-card b{font-size:15px}
#kopi-ai-monitor .am-card .am-row{font-weight:600}
#kopi-ai-monitor .am-legend{display:flex;gap:14px;flex:none}
#kopi-ai-monitor .cc-status{display:inline-flex;align-items:center;gap:7px;margin-top:8px;padding:6px 11px;border-radius:14px;background:#121512;border:1px solid rgba(255,255,255,.08);font-weight:700;font-size:11px;white-space:nowrap}
#kopi-ai-monitor .cc-status i{width:8px;height:8px;border-radius:50%;background:var(--lamp);box-shadow:0 0 8px var(--lamp);display:block}
#kopi-ai-monitor .cc-icon{margin-top:6px;width:32px;height:30px;padding:0;font-size:14px}
#kopi-ai-monitor .cc-kicker{margin:6px 0 0;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9aa596}
#kopi-ai-monitor .cc-kicker + .tc-page-title{margin-top:1px}
#kopi-ai-monitor .cc-grid{display:grid;grid-template-columns:168px 1fr;gap:14px;flex:1;min-height:0;align-items:start}
#kopi-ai-monitor .cc-steps{display:flex;flex-direction:column;gap:2px;min-height:0;overflow:hidden;position:relative}
#kopi-ai-monitor .cc-steps::before{content:'';position:absolute;left:9px;top:14px;bottom:44px;width:1px;background:rgba(255,255,255,.08)}
#kopi-ai-monitor .cc-step{display:flex;gap:8px;align-items:flex-start;padding:5px 2px;min-width:0}
#kopi-ai-monitor .cc-step span{display:flex;flex-direction:column;min-width:0}
#kopi-ai-monitor .cc-step em{font-style:normal;font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;gap:6px;align-items:baseline}
#kopi-ai-monitor .cc-step em i{font-style:normal;font-weight:600;font-size:10px;color:#7f8a7a}
#kopi-ai-monitor .cc-step.todo em{color:#5d6858}
#kopi-ai-monitor .cc-step.running em{color:#ffb35c}
#kopi-ai-monitor .cc-step small{color:#7f8a7a;font:10px Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#kopi-ai-monitor .cc-step.done em{color:#aab4a5}
#kopi-ai-monitor .cc-step b{flex:none;width:19px;height:19px;border-radius:50%;display:grid;place-items:center;font-size:10px;margin-top:0;position:relative;z-index:1;background:#000}
#kopi-ai-monitor .cc-ok{background:#163d22;color:#22e05a}
#kopi-ai-monitor .cc-bad{background:#3d1616;color:#ff5c5c}
#kopi-ai-monitor .cc-dot{border:1.5px solid #2c342a}
#kopi-ai-monitor .cc-spin{border:2px solid rgba(255,154,31,.25);border-top-color:#ff9a1f;animation:cc-spin .8s linear infinite}
@keyframes cc-spin{to{transform:rotate(360deg)}}
#kopi-ai-monitor .cc-limit{margin-top:auto;display:grid;grid-template-columns:1fr auto;gap:4px 8px;font-size:10px;color:#9aa596;padding:6px 2px 2px}
#kopi-ai-monitor .cc-limit b{color:#e8eee4}
#kopi-ai-monitor .cc-limit div{grid-column:1/-1;height:4px;border-radius:3px;background:#232a22;overflow:hidden}
#kopi-ai-monitor .cc-limit i{display:block;height:100%;border-radius:3px}
#kopi-ai-monitor .cc-card{background:linear-gradient(180deg,#121612,#0c0f0c);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:13px 15px;display:flex;flex-direction:column;gap:8px;min-height:0;max-height:100%;overflow:auto;scrollbar-width:thin}
#kopi-ai-monitor .cc-wide{align-items:flex-start}
#kopi-ai-monitor .cc-center{justify-content:center}
#kopi-ai-monitor .cc-label{color:#9aa596;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
#kopi-ai-monitor .cc-big{margin:0;font-size:15px;font-weight:700}
#kopi-ai-monitor .cc-red{color:#ff8a8a}
#kopi-ai-monitor .cc-code{display:block;font:11px/1.45 Consolas,monospace;color:#ffd7ab;background:#151915;border-radius:8px;padding:6px 8px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:56px;overflow:auto}
#kopi-ai-monitor .cc-msg{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:1.5;flex:1;min-height:0;overflow:auto}
#kopi-ai-monitor .cc-actions{display:flex;gap:8px;align-items:center;margin-top:auto}
#kopi-ai-monitor .cc-actions .am-note{flex:1}
#kopi-ai-monitor .am-ask{margin-bottom:8px}
#kopi-ai-monitor .am-tag{display:inline-block;background:#2a3227;color:#c6e994;border-radius:8px;padding:1px 7px;margin-right:6px;font-size:10px;font-weight:700}
#kopi-ai-monitor .am-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin:8px 0}
#kopi-ai-monitor .cc-solo{grid-template-columns:1fr}
#kopi-ai-monitor .cc-fit{scrollbar-width:none}
#kopi-ai-monitor .cc-fit .am-ask{margin:0}
#kopi-ai-monitor .cc-inline{display:flex;gap:8px;align-items:center}
#kopi-ai-monitor .cc-inline .am-note{flex:1;min-width:0}
#kopi-ai-monitor .cc-inline .am-primary{flex:none;padding:9px 18px}
#kopi-ai-monitor *{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.16) transparent}
#kopi-ai-monitor ::-webkit-scrollbar{width:6px;height:6px}
#kopi-ai-monitor ::-webkit-scrollbar-track{background:transparent}
#kopi-ai-monitor ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:3px}
#kopi-ai-monitor ::-webkit-scrollbar-button{display:none}
#kopi-ai-monitor .am-option:hover{border-color:rgba(255,179,92,.6);background:rgba(255,179,92,.08)}
#kopi-ai-monitor .am-option{display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left;font-weight:400;padding:10px 12px;border-radius:12px;min-width:0}
#kopi-ai-monitor .am-option small{color:#aab4a5;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
#kopi-ai-monitor .am-option.on{background:#ff9a1f;color:#1a1206;border-color:#ff9a1f}
#kopi-ai-monitor .am-option.on small{color:#3b2a0f}
#kopi-ai-monitor .am-note{flex:1;min-width:0;border:1px solid #536046;border-radius:10px;padding:6px 9px;background:#141b11;color:#f5f8f1;font:12px Arial,sans-serif;width:100%}
#kopi-ai-monitor .am-row .am-note{width:auto}
#kopi-ai-monitor .am-plan{border-left:3px solid #4cc9f0;padding:2px 10px;font-size:12px}
#kopi-ai-monitor .am-plan h4{margin:6px 0 2px;font-size:13px}
#kopi-ai-monitor .am-plan p{margin:2px 0}
#kopi-ai-monitor .am-plan code,#kopi-ai-monitor .am-li code{font:11px Consolas,monospace;color:#ffd7ab}
#kopi-ai-monitor .am-jump{margin-left:auto}
#kopi-ai-monitor .am-jump + .am-quiet{margin-left:0}
#kopi-ai-monitor .am-said{color:#aab4a5;font-size:11px;margin-bottom:3px}
#kopi-ai-monitor .am-question.am-done{border-left-color:#22e05a}
#kopi-ai-monitor .am-usage{flex:none}
#kopi-ai-monitor .am-lead{font-size:13px;margin:0 0 8px}
#kopi-ai-monitor .am-question b{display:block;margin-bottom:4px}
#kopi-ai-monitor .am-question code{display:block;font:11px/1.4 Consolas,monospace;color:#ffd7ab;white-space:pre-wrap;overflow-wrap:anywhere;max-height:70px;overflow:auto}
#kopi-ai-monitor .am-list{margin-top:8px;display:flex;flex-direction:column;gap:4px}
#kopi-ai-monitor .am-item{background:#151a13;border-radius:10px;padding:5px 9px;min-width:0}
#kopi-ai-monitor .am-item b{flex:none;max-width:40%}
#kopi-ai-monitor .am-quiet{margin-left:auto;background:transparent;border-color:transparent;color:#aab4a5}
#kopi-ai-monitor .am-quiet:hover{background:#2a1f1d;color:#ffaba3}
#kopi-ai-monitor .am-row{display:flex;align-items:center;gap:8px;flex:none}
#kopi-ai-monitor .am-dot{width:9px;height:9px;border-radius:50%;background:var(--lamp);box-shadow:0 0 10px color-mix(in srgb,var(--lamp),transparent 50%);display:inline-block;flex:none}
#kopi-ai-monitor .am-blink{animation:am-pulse 1.3s ease-in-out infinite}
#kopi-ai-monitor .am-body{flex:1;min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-color:#536248 transparent}
#kopi-ai-monitor .am-question{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;border-left:3px solid #ffa94b;padding:3px 10px}
#kopi-ai-monitor .am-compose{display:flex;gap:8px;align-items:flex-end;flex:none}
#kopi-ai-monitor textarea{resize:none;flex:1;min-width:0;height:52px;border:1px solid #536046;border-radius:12px;padding:9px;background:#141b11;color:#f5f8f1;font:12px/1.4 Arial,sans-serif;user-select:text}
#kopi-ai-monitor .am-error{color:#ffaba3;font-size:11px;overflow-wrap:anywhere;max-height:44px;overflow:auto}
#kopi-ai-monitor .am-track{height:4px;overflow:hidden;border-radius:6px;background:#35402d;flex:none}
#kopi-ai-monitor .am-wave{width:35%;height:100%;background:#ffa94b;animation:am-travel 1.5s ease-in-out infinite}
#kopi-ai-monitor .am-clock{margin-left:auto;color:#d1dacb;font-variant-numeric:tabular-nums;font-size:11px}
#kopi-ai-monitor .am-window{display:block;width:100%;text-align:left;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#kopi-ai-monitor .am-source{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
@keyframes am-pulse{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes am-travel{0%{transform:translateX(-100%)}100%{transform:translateX(380%)}}
#kopi-ai-monitor .cx-jump{margin-top:10px;display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:12px;background:#151915;border:1px solid rgba(255,255,255,.1);color:#e8eee4;font-size:11px;font-weight:600;white-space:nowrap}
#kopi-ai-monitor .cx-jump:hover{background:#1e241d;border-color:rgba(255,255,255,.22)}
#kopi-ai-monitor .cx-jump span{color:#9aa596}
#kopi-ai-monitor .cx-grid{display:grid;grid-template-columns:1.35fr 1fr;gap:12px;flex:1;min-height:0}
#kopi-ai-monitor .cx-hero{position:relative;display:flex;gap:16px;padding:16px 18px;border-radius:18px;border:1px solid rgba(255,255,255,.07);background:linear-gradient(160deg,#151a15,#0b0d0b);min-height:0;overflow:hidden}
#kopi-ai-monitor .cx-hero::before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 0% 0%,var(--glow,transparent),transparent 60%);opacity:.18}
#kopi-ai-monitor .cx-orange{--glow:#ff9a1f}
#kopi-ai-monitor .cx-green{--glow:#22e05a}
#kopi-ai-monitor .cx-red{--glow:#ff3b3b}
#kopi-ai-monitor .cx-light{position:relative;flex:none;align-self:flex-start;display:flex;flex-direction:column;gap:6px;padding:7px 6px;border-radius:14px;background:#050605;border:1px solid rgba(255,255,255,.08)}
#kopi-ai-monitor .cx-light i{display:block;width:14px;height:14px;border-radius:50%;opacity:.16;transition:opacity .3s}
#kopi-ai-monitor .cx-light .red{background:#ff3b3b}
#kopi-ai-monitor .cx-light .orange{background:#ff9a1f}
#kopi-ai-monitor .cx-light .green{background:#22e05a}
#kopi-ai-monitor .cx-light i.on{opacity:1;box-shadow:0 0 12px currentColor}
#kopi-ai-monitor .cx-light .red.on{color:#ff3b3b}
#kopi-ai-monitor .cx-light .orange.on{color:#ff9a1f}
#kopi-ai-monitor .cx-light .green.on{color:#22e05a}
#kopi-ai-monitor .cx-light i.blink{animation:am-pulse 1.1s ease-in-out infinite}
#kopi-ai-monitor .cx-main{position:relative;flex:1;min-width:0;display:flex;flex-direction:column;gap:7px;min-height:0}
#kopi-ai-monitor .cx-label{display:flex;align-items:center;gap:8px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9aa596}
#kopi-ai-monitor .cx-label em{font-style:normal;color:#c2ccbd}
#kopi-ai-monitor .cx-label em.orange{color:#ffb35c}
#kopi-ai-monitor .cx-label em.green{color:#5ee88a}
#kopi-ai-monitor .cx-label em.red{color:#ff8a8a}
#kopi-ai-monitor .cx-label span{letter-spacing:0;text-transform:none;font-weight:600}
#kopi-ai-monitor .cx-timer{font-variant-numeric:tabular-nums;color:#e8eee4}
#kopi-ai-monitor .cx-title{margin:0;font-size:18px;font-weight:700;line-height:1.25;color:#fff;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
#kopi-ai-monitor .cx-code{display:block;font:11px/1.4 Consolas,monospace;color:#ffd7ab;background:rgba(255,255,255,.05);border-radius:8px;padding:5px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#kopi-ai-monitor .cx-prompt{margin-top:auto;display:flex;flex-direction:column;gap:2px;padding-top:8px;border-top:1px solid rgba(255,255,255,.06)}
#kopi-ai-monitor .cx-prompt span{font-size:10px;font-weight:700;color:#7f8a7a;letter-spacing:.06em;text-transform:uppercase}
#kopi-ai-monitor .cx-prompt q{font-size:12px;color:#c2ccbd;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;quotes:'“' '”'}
#kopi-ai-monitor .cx-msg{flex:1;min-height:0;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12.5px;line-height:1.5;color:#eef3e8;padding-right:4px}
#kopi-ai-monitor .cx-compose textarea{height:38px;padding:9px 10px;border-radius:11px;background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.12)}
#kopi-ai-monitor .cx-compose .am-primary{padding:9px 16px}
#kopi-ai-monitor .cx-side{display:flex;flex-direction:column;gap:6px;padding:12px 12px 10px;border-radius:18px;border:1px solid rgba(255,255,255,.07);background:#0d100d;min-height:0;min-width:0}
#kopi-ai-monitor .cx-side-head{display:flex;justify-content:space-between;align-items:baseline;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9aa596;padding:0 2px}
#kopi-ai-monitor .cx-side-head small{letter-spacing:0;text-transform:none;font-weight:600;color:#7f8a7a}
#kopi-ai-monitor .cx-feed{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:2px;-webkit-mask-image:linear-gradient(#000 78%,transparent);mask-image:linear-gradient(#000 78%,transparent)}
#kopi-ai-monitor .cx-step{display:flex;align-items:center;gap:9px;padding:4px 2px;min-width:0}
#kopi-ai-monitor .cx-ico{flex:none;width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:rgba(255,255,255,.05);color:#c2ccbd}
#kopi-ai-monitor .cx-step.running .cx-ico{background:rgba(255,154,31,.14);color:#ffb35c}
#kopi-ai-monitor .cx-txt{flex:1;min-width:0;display:flex;flex-direction:column}
#kopi-ai-monitor .cx-txt em{font-style:normal;font-size:11.5px;font-weight:600;color:#e8eee4}
#kopi-ai-monitor .cx-step.done .cx-txt em{color:#aab4a5}
#kopi-ai-monitor .cx-txt small{font:10px Consolas,monospace;color:#7f8a7a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#kopi-ai-monitor .cx-step > b{flex:none;width:16px;height:16px;border-radius:50%;display:grid;place-items:center;font-size:9px}
#kopi-ai-monitor .cx-ok{color:#22e05a;background:rgba(34,224,90,.12)}
#kopi-ai-monitor .cx-bad{color:#ff5c5c;background:rgba(255,92,92,.12)}
#kopi-ai-monitor .cx-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#5d6858;font-size:11px;text-align:center}
#kopi-ai-monitor .cx-limit{display:flex;flex-direction:column;gap:4px;padding:8px 2px 0;border-top:1px solid rgba(255,255,255,.06);font-size:10.5px;color:#9aa596}
#kopi-ai-monitor .cx-limit > div:first-child{display:flex;justify-content:space-between}
#kopi-ai-monitor .cx-limit b{color:#e8eee4}
#kopi-ai-monitor .cx-limit small{font-size:9.5px;color:#7f8a7a}
#kopi-ai-monitor .cx-bar{height:4px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden}
#kopi-ai-monitor .cx-bar i{display:block;height:100%;border-radius:3px}
#kopi-ai-monitor .cx-others{flex:none;font-size:10.5px;color:#9aa596;padding:0 4px}
#kopi-ai-monitor .tc-page-head > .ch-head-right{flex:none}
#kopi-ai-monitor .ch-head-right{display:flex;align-items:center;gap:8px;margin-top:10px}
#kopi-ai-monitor .ch-head-right .cx-jump{margin-top:0}
#kopi-ai-monitor .ch-status{display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border-radius:12px;background:#121512;border:1px solid rgba(255,255,255,.08);font-weight:700;font-size:11px;white-space:nowrap}
#kopi-ai-monitor .ch-status i{width:8px;height:8px;border-radius:50%;background:var(--lamp);box-shadow:0 0 8px var(--lamp);display:block}
#kopi-ai-monitor .ch-status b{font-weight:600;color:#c2ccbd;font-variant-numeric:tabular-nums}
#kopi-ai-monitor .ch-chat{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column-reverse;padding:2px 6px 6px 0}
#kopi-ai-monitor .ch-inner{display:flex;flex-direction:column;gap:8px}
#kopi-ai-monitor .ch-row{display:flex;align-items:flex-end;gap:8px;min-width:0}
#kopi-ai-monitor .ch-row.me{justify-content:flex-end}
#kopi-ai-monitor .ch-avatar{flex:none;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:#22291f;color:#c6e994;border:1px solid rgba(198,233,148,.2)}
#kopi-ai-monitor .ch-bubble{max-width:78%;padding:9px 13px;border-radius:16px 16px 16px 5px;background:#171c17;border:1px solid rgba(255,255,255,.07);font-size:12.5px;line-height:1.5;color:#eef3e8;white-space:pre-wrap;overflow-wrap:anywhere;min-width:0}
#kopi-ai-monitor .ch-bubble.me{border-radius:16px 16px 5px 16px;background:#2b3a26;border-color:rgba(198,233,148,.18);color:#f2f7ec}
#kopi-ai-monitor .ch-bubble.wide{max-width:none;flex:1;white-space:normal}
#kopi-ai-monitor .ch-bubble.ask{border-color:rgba(255,154,31,.45);background:#1d1810}
#kopi-ai-monitor .ch-bubble.error{border-color:rgba(255,92,92,.4);background:#1d1111;white-space:normal}
#kopi-ai-monitor .ch-bubble.typing{display:flex;align-items:center;gap:10px;white-space:normal}
#kopi-ai-monitor .ch-bubble .cc-actions{margin-top:8px}
#kopi-ai-monitor .ch-bubble .cx-code{margin-top:6px}
#kopi-ai-monitor .ch-label{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#ffb35c;margin-bottom:4px}
#kopi-ai-monitor .ch-dim{color:#9aa596}
#kopi-ai-monitor .ch-typing{display:inline-flex;gap:3px}
#kopi-ai-monitor .ch-typing i{width:6px;height:6px;border-radius:50%;background:#ffb35c;animation:ch-dot 1.2s ease-in-out infinite}
#kopi-ai-monitor .ch-typing i:nth-child(2){animation-delay:.15s}
#kopi-ai-monitor .ch-typing i:nth-child(3){animation-delay:.3s}
@keyframes ch-dot{0%,60%,100%{opacity:.25;transform:none}30%{opacity:1;transform:translateY(-3px)}}
#kopi-ai-monitor .ch-steps{display:flex;flex-direction:column;gap:1px;margin:0 0 0 32px;padding:2px 0 2px 10px;border-left:1.5px solid rgba(255,255,255,.08)}
#kopi-ai-monitor .ch-step{display:flex;align-items:center;gap:7px;font-size:11px;color:#9aa596;min-width:0;padding:2px 0}
#kopi-ai-monitor .ch-step .ch-ico{flex:none;display:grid;place-items:center;color:#7f8a7a}
#kopi-ai-monitor .ch-step.running .ch-ico,#kopi-ai-monitor .ch-step.running em{color:#ffb35c}
#kopi-ai-monitor .ch-step em{font-style:normal;font-weight:600;flex:none}
#kopi-ai-monitor .ch-step small{font:10.5px Consolas,monospace;color:#6f7a6b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}
#kopi-ai-monitor .ch-step > b{flex:none;width:14px;height:14px;border-radius:50%;display:grid;place-items:center;font-size:8px}
#kopi-ai-monitor .ch-step > b.cc-spin{border-width:1.5px}
#kopi-ai-monitor .ch-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:#7f8a7a;text-align:center;font-size:11.5px}
#kopi-ai-monitor .ch-empty svg{color:#c6e994;margin-bottom:4px}
#kopi-ai-monitor .ch-empty b{color:#eef3e8;font-size:14px}
#kopi-ai-monitor .ch-compose{flex:none;display:flex;gap:8px;align-items:center;padding:6px;border-radius:16px;background:#111411;border:1px solid rgba(255,255,255,.09)}
#kopi-ai-monitor .ch-compose textarea{height:34px;border:0;background:transparent;padding:8px 8px;font-size:12.5px}
#kopi-ai-monitor .ch-compose textarea:focus-visible{outline:none}
#kopi-ai-monitor .ch-compose .am-primary{border-radius:11px;padding:8px 16px}
#kopi-ai-monitor .ch-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:10.5px;color:#7f8a7a;padding:2px 4px}
#kopi-ai-monitor .ch-limit{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
#kopi-ai-monitor .ch-limit b{color:#e8eee4}
#kopi-ai-monitor .ch-limit i{display:block;width:70px;height:4px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden}
#kopi-ai-monitor .ch-limit s{display:block;height:100%;border-radius:3px}
#kopi-ai-monitor .ch-summary{margin:2px 0 0 32px;padding:10px 12px;border-radius:14px;background:linear-gradient(180deg,#131813,#0e110e);border:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;gap:7px}
#kopi-ai-monitor .ch-sum-head{display:flex;justify-content:space-between;align-items:center;font-size:11px}
#kopi-ai-monitor .ch-sum-title{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9aa596}
#kopi-ai-monitor .ch-sum-head .ok{color:#5ee88a}
#kopi-ai-monitor .ch-sum-head .ask{color:#ffb35c}
#kopi-ai-monitor .ch-sum-head .bad{color:#ff8a8a}
#kopi-ai-monitor .ch-sum-chips{display:flex;flex-wrap:wrap;gap:6px}
#kopi-ai-monitor .ch-sum-chips span{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:9px;background:rgba(255,255,255,.05);font-size:11px;color:#dfe7da}
#kopi-ai-monitor .ch-sum-chips svg{color:#9aa596}
#kopi-ai-monitor .ch-sum-files{display:flex;flex-wrap:wrap;align-items:center;gap:5px}
#kopi-ai-monitor .ch-sum-files small{font-size:10px;color:#7f8a7a;margin-right:2px}
#kopi-ai-monitor .ch-sum-files code{font:10.5px Consolas,monospace;color:#ffd7ab;background:rgba(255,215,171,.07);border-radius:6px;padding:2px 6px}
#kopi-ai-monitor .am-shell{position:relative}
#kopi-ai-monitor .ch-model{display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border-radius:12px;background:#121512;border:1px solid rgba(255,255,255,.08);font-size:11px;font-weight:700;color:#e8eee4;white-space:nowrap}
#kopi-ai-monitor .ch-model svg{color:#c6e994}
#kopi-ai-monitor .ch-model span{color:#7f8a7a;font-size:9px}
#kopi-ai-monitor .ch-model-menu{position:absolute;top:50px;right:0;z-index:20;width:420px;padding:8px;border-radius:16px;background:#101310;border:1px solid rgba(255,255,255,.12);box-shadow:0 18px 40px rgba(0,0,0,.6);display:grid;grid-template-columns:1fr 1fr;gap:4px}
#kopi-ai-monitor .ch-model-menu .ch-model-head,#kopi-ai-monitor .ch-model-menu p{grid-column:1/-1}
#kopi-ai-monitor .ch-model-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:2px 8px 4px;font-size:11px;font-weight:700;color:#fff}
#kopi-ai-monitor .ch-model-head small{font-weight:500;color:#9aa596;font-size:10px}
#kopi-ai-monitor .ch-model-menu button{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:1px;text-align:left;padding:6px 26px 6px 10px;min-width:0;border:1px solid transparent;border-radius:11px;background:transparent;font-weight:400}
#kopi-ai-monitor .ch-model-menu button:hover{background:rgba(255,255,255,.05)}
#kopi-ai-monitor .ch-model-menu button.on{background:rgba(198,233,148,.09);border-color:rgba(198,233,148,.25)}
#kopi-ai-monitor .ch-model-menu button b{font-size:12px}
#kopi-ai-monitor .ch-model-menu button small{font-size:10px;line-height:1.3;color:#9aa596}
#kopi-ai-monitor .ch-model-menu button i{position:absolute;right:11px;top:50%;transform:translateY(-50%);font-style:normal;color:#c6e994;font-weight:700}
#kopi-ai-monitor .ch-model-menu p{margin:4px 8px 2px;font-size:10px;color:#7f8a7a}
#kopi-ai-monitor .ch-model-menu code{font:10px Consolas,monospace;color:#ffd7ab}
#kopi-ai-monitor .am-picks{display:flex;gap:4px;padding:3px;margin:0 0 8px;border-radius:12px;background:#111411;border:1px solid rgba(255,255,255,.07);width:max-content}
#kopi-ai-monitor .am-pick{display:flex;align-items:center;gap:6px;border:0;background:transparent;color:#9aa596;padding:5px 11px;border-radius:9px;font:600 11px "Segoe UI",sans-serif;cursor:pointer}
#kopi-ai-monitor .am-pick:hover{color:#fff}
#kopi-ai-monitor .am-pick.on{background:#262d24;color:#fff}
#kopi-ai-monitor .am-pick i{width:7px;height:7px;border-radius:50%;background:var(--lamp);box-shadow:0 0 6px var(--lamp)}
/* on Kopi's stage (Claude Code / Codex): the chat look, Kopi bottom left */
#kopi-ai-monitor.cc-stage .am-shell{padding:8px 14px 10px 96px;gap:8px}
#kopi-ai-monitor.cc-stage .tc-page-head{align-items:center;margin:0;justify-content:space-between}
#kopi-ai-monitor.cc-stage .tc-page-head > .cc-pill{flex:0 1 auto;margin-right:auto}
#kopi-ai-monitor .cc-pill{display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border-radius:999px;background:rgba(255,255,255,.1);font:600 12px "Segoe UI",sans-serif;color:#fff;max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#kopi-ai-monitor .cc-pill i{width:8px;height:8px;border-radius:50%;background:var(--lamp);box-shadow:0 0 8px var(--lamp);flex:none}
#kopi-ai-monitor .cc-pill span{color:rgba(255,255,255,.55);font-weight:500}
#kopi-ai-monitor.cc-stage .ch-head-right{margin-top:0}
#kopi-ai-monitor.cc-stage .ch-model,#kopi-ai-monitor.cc-stage .ch-status,#kopi-ai-monitor.cc-stage .cx-jump{background:rgba(255,255,255,.09);border:0;border-radius:999px;padding:6px 12px}
#kopi-ai-monitor.cc-stage .ch-model svg{color:#ffc29a}
#kopi-ai-monitor.cc-stage .ch-model-menu{background:#1c120d;border-color:rgba(255,170,120,.18)}
#kopi-ai-monitor.cc-stage .ch-model-menu button.on{background:rgba(255,154,90,.14);border-color:rgba(255,154,90,.35)}
#kopi-ai-monitor.cc-stage .ch-model-menu button i{color:#ffb07a}
#kopi-ai-monitor.cc-stage .ch-chat{padding:0 6px 0 0}
#kopi-ai-monitor.cc-stage .ch-inner{gap:10px}
#kopi-ai-monitor.cc-stage .ch-avatar{display:none}
#kopi-ai-monitor.cc-stage .ch-bubble{font:13.5px/1.5 "Segoe UI",sans-serif}
#kopi-ai-monitor.cc-stage .ch-bubble:not(.me):not(.ask):not(.error):not(.wide){background:none;border:0;padding:0 2px;max-width:100%;color:#f6efe9}
#kopi-ai-monitor.cc-stage .ch-bubble.me{background:rgba(255,255,255,.13);border:0;border-radius:14px;padding:7px 14px;font-weight:600;font-size:13px;max-width:75%}
#kopi-ai-monitor.cc-stage .ch-bubble.ask{background:rgba(255,154,31,.13);border:1px solid rgba(255,179,92,.35);border-radius:14px}
#kopi-ai-monitor.cc-stage .ch-bubble.wide{background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.08);border-radius:14px}
#kopi-ai-monitor.cc-stage .ch-bubble.error{background:rgba(255,92,92,.12);border:1px solid rgba(255,120,120,.3);border-radius:14px}
#kopi-ai-monitor.cc-stage .ch-bubble.typing{background:none;border:0;padding:0 2px}
#kopi-ai-monitor.cc-stage .ch-typing i{background:#ffb07a}
#kopi-ai-monitor.cc-stage .ch-steps{margin:0;border-left-color:rgba(255,255,255,.12)}
#kopi-ai-monitor.cc-stage .ch-step{color:rgba(255,236,226,.62)}
#kopi-ai-monitor.cc-stage .ch-step small{color:rgba(255,236,226,.45)}
#kopi-ai-monitor.cc-stage .ch-summary{margin:0;background:rgba(0,0,0,.24);border:1px solid rgba(255,255,255,.08);border-radius:14px}
#kopi-ai-monitor.cc-stage .ch-sum-chips span{background:rgba(255,255,255,.08);color:#fff3ea}
#kopi-ai-monitor.cc-stage .ch-sum-files code{background:rgba(255,190,150,.12);color:#ffd1b0}
#kopi-ai-monitor.cc-stage .ch-compose{background:rgba(255,255,255,.08);border:0;border-radius:12px;padding:3px 4px 3px 6px}
#kopi-ai-monitor.cc-stage .ch-compose textarea{background:transparent;border:0;color:#fff}
#kopi-ai-monitor.cc-stage .ch-compose .am-primary{background:#fff;color:#1a1310;border:0;border-radius:999px;padding:7px 16px}
#kopi-ai-monitor.cc-stage .ch-foot{color:rgba(255,236,226,.55)}
#kopi-ai-monitor.cc-stage .am-primary{background:#ffb07a;border-color:#ffb07a;color:#2a1508}
#kopi-ai-monitor.cc-stage .ch-empty{color:rgba(255,236,226,.6)}#kopi-ai-monitor.cc-stage .ch-empty svg{color:#ffb07a}
#kopi-ai-monitor .ch-bubble.md{white-space:normal}
#kopi-ai-monitor .ch-bubble.md p{margin:0 0 8px}#kopi-ai-monitor .ch-bubble.md p:last-child{margin-bottom:0}
#kopi-ai-monitor .ch-bubble.md ul,#kopi-ai-monitor .ch-bubble.md ol{margin:2px 0 8px;padding-left:20px}#kopi-ai-monitor .ch-bubble.md li{margin:2px 0}
#kopi-ai-monitor .ch-bubble.md code{font:12px "Cascadia Code",Consolas,monospace;background:rgba(255,255,255,.1);border-radius:5px;padding:1px 5px;color:#ffe2cc}
#kopi-ai-monitor .ch-bubble.md pre{margin:4px 0 8px;padding:8px 11px;border-radius:10px;background:rgba(0,0,0,.32);border:1px solid rgba(255,255,255,.08);font:12px/1.5 "Cascadia Code",Consolas,monospace;color:#ffe6d4;white-space:pre-wrap;overflow-wrap:anywhere}
#kopi-ai-monitor .ch-bubble.md b{color:#fff}
/* the model menu: one clean list, the current one with a check */
#kopi-ai-monitor .ch-model-menu{top:40px;width:340px;padding:5px;border-radius:14px;background:#1c140f;border:1px solid rgba(255,190,150,.16);box-shadow:0 22px 50px rgba(0,0,0,.65);grid-template-columns:1fr;gap:2px}
#kopi-ai-monitor .ch-model-head{padding:5px 10px 4px;font:700 11.5px "Segoe UI",sans-serif;flex-direction:column;align-items:flex-start;gap:1px}
#kopi-ai-monitor .ch-model-head small{color:rgba(255,236,226,.5)}
#kopi-ai-monitor .ch-model-menu button{flex-direction:row;align-items:center;gap:10px;padding:6px 30px 6px 10px;border-radius:10px;font-family:"Segoe UI",sans-serif}
#kopi-ai-monitor .ch-model-menu button b{font-size:12.5px;min-width:70px;color:#fff}
#kopi-ai-monitor .ch-model-menu button small{font-size:11px;color:rgba(255,236,226,.55);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
#kopi-ai-monitor .ch-model-menu button:hover{background:rgba(255,255,255,.07)}
#kopi-ai-monitor .ch-model-menu button.on{background:rgba(255,160,100,.16);border-color:transparent}
#kopi-ai-monitor .ch-model-menu button i{color:#ffb07a;font-size:13px}
#kopi-ai-monitor .ch-model-menu p{margin:2px 10px 3px;padding-top:5px;border-top:1px solid rgba(255,255,255,.07);font:10.5px "Segoe UI",sans-serif;color:rgba(255,236,226,.45)}
/* the reply box: like the chat's */
#kopi-ai-monitor .ch-compose{align-items:center;border-radius:14px;padding:4px 5px 4px 6px}
#kopi-ai-monitor .ch-compose textarea{height:32px;padding:7px 8px;font:13px "Segoe UI",sans-serif;caret-color:#ffc29a}
#kopi-ai-monitor .ch-compose:focus-within{box-shadow:inset 0 0 0 1px rgba(255,176,122,.5)}
#kopi-ai-monitor .ch-compose #am-send{width:30px;height:30px;padding:0;border-radius:50%;background:#fff;color:#1a1310;border:0;font:700 15px "Segoe UI",sans-serif;flex:none}
#kopi-ai-monitor .ch-compose #am-send:disabled{opacity:.4}
#kopi-ai-monitor.cc-codex .ch-typing i,#kopi-ai-monitor.cc-codex .am-primary{background:#7fb6ff;border-color:#7fb6ff;color:#06182e}
#kopi-ai-monitor.cc-codex .ch-bubble.ask{background:rgba(59,130,246,.14);border-color:rgba(127,182,255,.4)}
#kopi-ai-monitor.cc-codex .ch-compose:focus-within{box-shadow:inset 0 0 0 1px rgba(127,182,255,.55)}
#kopi-ai-monitor.cc-codex .ch-bubble.md code{color:#dbeaff}
#kopi-ai-monitor .ch-hist-title{font:700 10.5px "Segoe UI",sans-serif;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,236,226,.5);margin:2px 2px 0}
#kopi-ai-monitor .ch-hist{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.05);min-width:0}
#kopi-ai-monitor .ch-hist:hover{background:rgba(255,255,255,.09)}
#kopi-ai-monitor .ch-hist div{flex:1;min-width:0;display:flex;flex-direction:column}
#kopi-ai-monitor .ch-hist b{font:600 12.5px "Segoe UI",sans-serif;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#kopi-ai-monitor .ch-hist small{font:11px "Segoe UI",sans-serif;color:rgba(255,236,226,.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#kopi-ai-monitor .ch-hist-mark{flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:800;background:rgba(255,255,255,.08);color:#fff}
#kopi-ai-monitor .ch-hist-mark.done{background:rgba(94,232,138,.16);color:#7ef0a4}
#kopi-ai-monitor .ch-hist-mark.question{background:rgba(255,179,92,.18);color:#ffc27a}
#kopi-ai-monitor .ch-hist-mark.error{background:rgba(255,92,92,.16);color:#ff9a9a}
#kopi-ai-monitor .ch-hist i{flex:none;font:600 11px "Segoe UI",sans-serif;font-style:normal;color:rgba(255,236,226,.55)}
#kopi-ai-monitor .ch-hist i.done{color:#7ef0a4}#kopi-ai-monitor .ch-hist i.question{color:#ffc27a}#kopi-ai-monitor .ch-hist i.error{color:#ff9a9a}
@media(prefers-reduced-motion:reduce){#kopi-ai-monitor .ch-typing i{animation:none}#kopi-ai-monitor .cx-light i.blink,#kopi-ai-monitor .am-blink,#kopi-ai-monitor .am-wave{animation:none}}
`; document.head.appendChild(style);
  const escape = text => String(text || '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
  function md(text) {
    const inline = t => t.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    let html = '', list = null, block = null, para = [];
    const flush = () => { if (para.length) { html += '<p>' + inline(para.join('<br>')) + '</p>'; para = []; } }, close = () => { if (list) { html += `</${list}>`; list = null; } };
    for (const line of escape(text).split('\n')) {
      if (/^\s*```/.test(line)) { if (block) { html += `<pre>${block.join('\n')}</pre>`; block = null; } else { flush(); close(); block = []; } continue; }
      if (block) { block.push(line); continue; }
      const item = line.match(/^\s*(?:([-•*])|(\d+)[.)])\s+(.*)$/), head = line.match(/^#{1,4}\s+(.*)$/);
      if (item) { flush(); const kind = item[1] ? 'ul' : 'ol'; if (list !== kind) { close(); html += `<${kind}>`; list = kind; } html += '<li>' + inline(item[3]) + '</li>'; continue; }
      if (head) { flush(); close(); html += '<p><b>' + inline(head[1]) + '</b></p>'; continue; }
      if (!line.trim()) { flush(); close(); continue; }
      close(); para.push(line);
    }
    if (block) html += `<pre>${block.join('\n')}</pre>`;
    flush(); close(); return html;
  }
  const providers = () => state.providers || [];
  const current = () => providers().find(p => p.provider === selected);
  // Claude Code only shows in the small island while a session has something to tell (like Coucou).
  const shown = p => p.connected && !(p.kind === 'hooks' && p.state === 'ready');
  const active = () => providers().some(shown);
  const busy = p => ['running', 'sending'].includes(p.state);
  const key = p => p?.provider + ':' + (p?.questionId || '');
  const colourOf = state => paletteColour(state) || colours[state] || colours.disconnected; // paletteColour: defined below, used after init
  const lamp = p => `<span class="am-dot ${busy(p) ? 'am-blink' : ''}" style="--lamp:${colourOf(p.state)}"></span>`;
  // After you have looked at Claude Code, green/red/question go quiet again (eyes back to normal).
  function markSeen() {
    if (currentView === 'monitor' && ['claudecode', 'codex'].includes(selected) && api.aiMonitorHooksSeen) api.aiMonitorHooksSeen().then(update).catch(() => {});
  }
  function open(provider, exact) {
    // Claude Code, Codex, Claude or ChatGPT (the switch at the top of the page).
    // the AI tile on the home screen opens whichever AI has something to tell right now
    if (!exact && provider === 'claudecode' && top() && top().provider !== 'claudecode') provider = top().provider;
    const next = Object.hasOwn(names, provider) ? provider : 'claudecode';
    if (next !== selected) markSeen();
    selected = next; error = ''; render();
    setView('monitor'); setMode('expanded'); lastActivity = performance.now();
  }
  function small() {
    if (root.contains(document.activeElement)) document.activeElement.blur();
    markSeen(); currentView = 'home'; setMode('rest');
  }
  const bind = (id, fn) => root.querySelector('#' + id)?.addEventListener('click', fn);
  // Claude Code · Codex · Claude · ChatGPT: each with its own little lamp.
  function picker() {
    return `<div class="am-picks">${PICKS.map(([id, label]) => {
      const q = providers().find(x => x.provider === id), st = q?.connected ? (q.permission ? 'question' : q.state) : 'disconnected';
      return `<button type="button" class="am-pick ${selected === id ? 'on' : ''}" data-pick="${id}"><i class="${q && busy(q) ? 'am-blink' : ''}" style="--lamp:${q?.connected ? colourOf(st) : 'rgba(255,255,255,.18)'}"></i>${label}</button>`;
    }).join('')}</div>`;
  }
  function render() {
    const p = current() || providers().find(x => x.provider === 'claudecode');
    root.innerHTML = p ? `<div class="am-shell">${hooksPage(p)}${error ? `<div class="am-error" role="alert">${escape(error)}</div>` : ''}</div>` : '';
    bind('am-small', small);
    bind('am-open-connect', () => { window.kopi.settingsOpen?.('connect'); small(); }); // connecting lives in the Rehatt app
    bind('am-jump', () => hooks('aiMonitorHooksJump', p?.sessionId));
    root.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => { if (b.dataset.pick !== selected) { markSeen(); selected = b.dataset.pick; error = ''; render(); } }));
    for (const button of root.querySelectorAll('[data-provider]')) button.addEventListener('click', () => open(button.dataset.provider));
    const body = root.querySelector('.ch-chat'); if (body) body.scrollTop = 0; // column-reverse: 0 = the newest message
  }
  // "5 hr: 23% · full again at 14:30 · week: 41%" under the status.
  function usageLine(p) {
    const u = p.usage || {}, at = s => new Date(s * 1000).toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit' });
    const parts = [];
    if (u.fiveHour) parts.push(`${T('5 jam', '5 hr')}: <b style="color:${ringColour(u.fiveHour.used)}">${u.fiveHour.used}%</b>${u.fiveHour.resetsAt ? T(' · penuh semula pada ', ' · full again at ') + at(u.fiveHour.resetsAt) : ''}`);
    if (u.sevenDay) parts.push(`${T('minggu', 'week')}: ${u.sevenDay.used}%`);
    if (u.context != null) parts.push(T(`sembang ${u.context}% penuh`, `chat ${u.context}% full`));
    return parts.length ? `<div class="am-hint am-usage">${parts.join(' · ')}</div>` : '';
  }
  // Claude page, like an iPhone Live Activity:
  // left a big card with a real traffic light (Rehatt's idea), what Claude does now, a live timer and your question;
  // right the activity feed (one line per step, with an icon) and your 5-hour limit.
  // Questions, plans and permissions get the full width, so answering is easy.
  const ICON_PATHS = {
    read: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>',
    run: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m7 10 3 2.5L7 15M12 15h4"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
    web: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16"/>',
    agent: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M7 7l2 2M15 15l2 2M17 7l-2 2M9 15l-2 2"/>',
    other: '<circle cx="12" cy="12" r="7"/><path d="M12 9v3l2 2"/>'
  };
  const svg = (name, size = 15) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ICON_PATHS.other}</svg>`;
  const NOW_MS = { read: 'Membaca', edit: 'Menyunting', run: 'Menjalankan', search: 'Mencari', web: 'Mencari di web', agent: 'Pembantu bekerja', other: 'Sedang bekerja' };
  const PAST_MS = { read: 'Dibaca', edit: 'Disunting', run: 'Dijalankan', search: 'Dicari', web: 'Dicari di web', agent: 'Pembantu siap', other: 'Siap' };
  const NOW_EN = { read: 'Reading', edit: 'Editing', run: 'Running', search: 'Searching', web: 'Searching the web', agent: 'Helper working', other: 'Working' };
  const PAST_EN = { read: 'Read', edit: 'Edited', run: 'Ran', search: 'Searched', web: 'Searched the web', agent: 'Helper done', other: 'Done' };
  const NOW = new Proxy({}, { get: (_, k) => (MS() ? NOW_MS : NOW_EN)[k] }), PAST = new Proxy({}, { get: (_, k) => (MS() ? PAST_MS : PAST_EN)[k] });
  const clock = sec => sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  const shortWhat = (kind, what) => !what ? '' : ['read', 'edit'].includes(kind) ? what.split(/[\\/]/).pop() : what.replace(/\s+/g, ' ');
  // Live timer: the page is only rebuilt on events, so this ticks the seconds in between.
  setInterval(() => {
    for (const el of root.querySelectorAll('.cx-timer[data-live="1"]')) el.textContent = clock(Number(el.dataset.base) + Math.floor((Date.now() - Number(el.dataset.at)) / 1000));
  }, 1000);

  function hooksPage(p) {
    const off = pending ? 'disabled' : '';
    const st = p.state;
    const project = p.source?.title && p.source.title !== 'No active session' ? p.source.title : '';
    const statusText = MS() ? ({ running: 'Sedang bekerja', sending: 'Sedang bekerja', question: 'Menunggu anda', done: 'Siap', error: 'Ralat', stopped: 'Berhenti' }[st] || 'Rehat')
      : ({ running: 'Working', sending: 'Working', question: 'Waiting for you', done: 'Done', error: 'Error', stopped: 'Stopped' }[st] || 'Idle');
    // Only while Claude works: a live timer. When he's done the time doesn't matter anymore.
    const timer = busy(p) ? ` · <b class="cx-timer" data-live="1" data-base="${p.elapsed || 0}" data-at="${Date.now()}">${clock(p.elapsed || 0)}</b>` : '';
    const calm = p.agent === 'codex' ? '#5b9bff' : '#e8865a', lampOf = x => ['ready', 'disconnected', 'connecting'].includes(x) ? calm : colourOf(x); // quiet = the AI's own colour, not grey
    const pill = p.connected ? `<span class="ch-status" style="--lamp:${lampOf(st)}"><i class="${busy(p) ? 'am-blink' : ''}"></i>${statusText}${timer}</span>` : '';
    const jump = p.canJump ? `<button type="button" class="cx-jump" id="am-jump" title="${T(`Bawa tetingkap ${escape(p.name)} ke hadapan`, `Bring the ${escape(p.name)} window to the front`)}">${T('Ke terminal', 'To terminal')} <span>↗</span></button>` : '';
    const picker = { button: '', menu: '' };
    const head = p.connected
      ? `<div class="tc-page-head"><div class="cc-pill"><i style="--lamp:${lampOf(st)}" class="${busy(p) ? 'am-blink' : ''}"></i>${escape(project || p.name)}${project ? `<span>· ${escape(p.name)}</span>` : ''}</div><div class="ch-head-right">${picker.button}${pill}${jump}</div></div>${picker.menu}`
      : `<div class="tc-page-head"><div><p class="cc-kicker">${escape(p.name)}</p><p class="tc-page-title">${escape(project || p.name)}</p></div><div class="ch-head-right">${picker.button}${pill}${jump}</div></div>${picker.menu}`;
    if (!p.connected) {
      if (p.agent === 'codex' && p.available === false) return head + `<div class="cc-card cc-wide"><p class="cc-big">${T('Codex belum ada dalam PC ini', 'Codex is not on this PC yet')}</p><p class="am-hint">${T('Pasang Codex (pembantu pengaturcaraan AI daripada OpenAI) dan buka sekali. Kemudian kembali ke sini untuk menyambungkannya.', 'Install Codex (the AI coding helper from OpenAI) and open it once. Then come back here to connect it.')}</p></div>`;
      return head + `<div class="cc-card cc-wide"><p class="cc-big">${T(`Lihat terus apa yang ${escape(p.name)} sedang buat`, `See right away what ${escape(p.name)} is doing`)}</p><p class="am-hint">${T('Sedang bekerja, ada soalan, siap atau ralat: Rehatt tunjukkan semuanya', 'Working, a question, done or an error: Kopi tells you')}${p.agent === 'codex' ? T(', semasa anda buat kerja lain', ', while you do something else') : T(', walaupun anda mengawal Claude Code dari telefon', ', even when you drive Claude Code from your phone')}.</p>${
        p.error ? `<p class="am-error">${escape(p.error)}</p>` : p.hooksInstalled ? `<p class="am-hint">${T('Disambungkan. Tunggu sebentar sehingga Rehatt siap bermula.', 'Connected. Wait a moment until Rehatt has finished starting.')}</p>`
          : `<button type="button" class="am-primary" id="am-open-connect">${T('Sambungkan dalam Rehatt', 'Connect in Rehatt')}</button><p class="am-hint">${T('Satu suis dalam Rehatt → Sambungan. Rehatt uruskan selebihnya.', 'One switch in Rehatt → Connections. Rehatt does the rest.')}</p>`}</div>`;
    }

    // ---- the conversation, like the Claude app: you on the right, Claude on the left ----
    const msgs = [];
    if (p.prompt) msgs.push(`<div class="ch-row me"><div class="ch-bubble me">${escape(p.prompt)}</div></div>`);
    const steps = (p.steps || []).slice(-6);
    if (steps.length) msgs.push(`<div class="ch-steps">${steps.map(s => `<div class="ch-step ${s.state}"><span class="ch-ico">${svg(s.kind, 12)}</span><em>${(s.state === 'running' ? NOW : PAST)[s.kind] || PAST.other}</em><small>${escape(shortWhat(s.kind, s.what))}</small>${s.state === 'running' ? '<b class="cc-spin"></b>' : s.state === 'failed' ? '<b class="cx-bad">✕</b>' : '<b class="cx-ok">✓</b>'}</div>`).join('')}</div>`);
    const claude = (inner, cls = '') => `<div class="ch-row"><span class="ch-avatar">${svg('run', 13)}</span><div class="ch-bubble ${cls}">${inner}</div></div>`;
    if (st === 'question') msgs.push(claude(`<div class="ch-label">${T('Jawab dalam terminal', 'Answer in the terminal')}</div>` + md(p.question || p.lastMessage || T('Claude memerlukan anda di terminal.', 'Claude needs you in the terminal.')), 'ask md'));
    else if (st === 'done' && p.lastMessage) msgs.push(claude(md(p.lastMessage), 'md'));
    else if (st === 'error' || st === 'stopped') msgs.push(claude(`<b>${escape(p.detail || T('Ada yang tidak kena', 'Something went wrong'))}</b><br><span class="ch-dim">${T('Lihat di terminal apa yang tidak kena.', 'Check the terminal to see what went wrong.')}</span>`, 'error'));
    else if (busy(p)) msgs.push(claude(`<span class="ch-typing"><i></i><i></i><i></i></span><span class="ch-dim">${escape((s => s ? `${NOW[s.kind] || T('Sedang bekerja', 'Working')} ${shortWhat(s.kind, s.what)}` : T('Claude sedang bekerja', 'Claude is working'))((p.steps || []).filter(x => x.state === 'running').pop()))}</span>`, 'typing'));
    // ---- always a summary at the end: what Claude did, which files changed ----
    if (['done', 'error', 'stopped', 'question'].includes(st)) {
      const n = p.stats || {}, chip = (icon, count, one, many) => count ? `<span>${svg(icon, 12)}${count} ${count === 1 ? one : many}</span>` : '';
      const chips = EN() ? [chip('edit', n.edit, 'file edited', 'files edited'), chip('read', n.read, 'file read', 'files read'), chip('run', n.run, 'command', 'commands'), chip('search', (n.search || 0) + (n.web || 0), 'search', 'searches')].join('')
        : [chip('edit', n.edit, 'fail disunting', 'fail disunting'), chip('read', n.read, 'fail dibaca', 'fail dibaca'),
        chip('run', n.run, 'arahan', 'arahan'), chip('search', (n.search || 0) + (n.web || 0), 'carian', 'carian')].join('');
      const head = st === 'done' ? `<b class="ok">✓ ${T('Siap', 'Done')}</b>` : st === 'question' ? `<b class="ask">● ${T('Menunggu anda', 'Waiting for you')}</b>` : `<b class="bad">✕ ${T('Berhenti kerana ralat', 'Stopped with an error')}</b>`;
      const files = (p.files || []).length ? `<div class="ch-sum-files"><small>${T('Diubah', 'Changed')}</small>${p.files.map(f => `<code>${escape(f)}</code>`).join('')}</div>` : '';
      msgs.push(`<div class="ch-summary"><div class="ch-sum-head"><span class="ch-sum-title">${T('Ringkasan', 'Summary')}</span>${head}</div>${chips ? `<div class="ch-sum-chips">${chips}</div>` : `<div class="ch-sum-chips"><span>${T('Tiada fail disentuh', 'No files touched')}</span></div>`}${files}</div>`);
    }
    const past = (state.history || []).filter(h => (h.agent || 'claude') === (p.agent || 'claude')).slice(0, 8);
    if (!msgs.length && past.length) {
      const when = at => { const d = new Date(at), today = new Date().toDateString() === d.toDateString(); return (today ? '' : d.toLocaleDateString(LOCALE(), { day: 'numeric', month: 'short' }) + ' · ') + d.toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit' }); };
      const RES = { done: ['✓', T('Siap', 'Done')], question: ['●', T('Soalan', 'Question')], error: ['✕', T('Ralat', 'Error')] };
      msgs.push(`<div class="ch-hist-title">${T(`Apa yang ${escape(p.name)} buat untuk anda baru-baru ini`, `What ${escape(p.name)} did for you lately`)}</div>` + past.slice().reverse().map(h => { // oldest first: the newest sits at the bottom, in view
        const [mark, word] = RES[h.result] || ['•', ''], extra = [h.project, h.files ? T(`${h.files} fail`, `${h.files} file${h.files === 1 ? '' : 's'}`) : '', h.seconds ? (h.seconds >= 60 ? Math.round(h.seconds / 60) + ' min' : h.seconds + ' s') : ''].filter(Boolean).join(' · ');
        return `<div class="ch-hist"><span class="ch-hist-mark ${escape(h.result)}">${mark}</span><div><b>${escape(h.prompt)}</b><small>${escape(when(h.at))}${extra ? ' · ' + escape(extra) : ''}</small></div><i class="${escape(h.result)}">${word}</i></div>`;
      }).join(''));
    }
    if (!msgs.length) msgs.push(`<div class="ch-empty">${svg('run', 26)}<b>${T('Belum ada sembang', 'No chat yet')}</b><span>${T(`Taip sesuatu dalam ${escape(p.name)}. Di sini anda nampak sembang itu secara langsung.`, `Type something in ${escape(p.name)}. You see the chat live here.`)}</span></div>`);

    // ---- bottom: reply box (when Claude waits for you) or a small limit line ----
    const u = p.usage?.fiveHour;
    const limit = u ? `<span class="ch-limit">${T('Had 5 jam', '5-hour limit')} <b>${u.used}%</b><i><s style="width:${Math.min(100, u.used)}%;background:${ringColour(u.used)}"></s></i></span>` : '';
    const footer = `<div class="ch-foot"><span>${busy(p) ? T('Claude sedang bekerja. Masa untuk regangan sekejap?', 'Claude is working. Time for a quick stretch?') : st === 'question' ? T('Klik "Ke terminal" untuk menjawab.', 'Click "To terminal" to answer.') : st === 'done' ? T('Mahu teruskan? Taip dalam terminal anda.', 'Keep going? Type in your terminal.') : ''}</span>${limit}</div>`;
    return head + `<div class="ch-chat"><div class="ch-inner">${msgs.join('')}</div></div>${footer}`; // column-reverse: always shows the newest message
  }
  // "read 3 · edited 2 · commands 1" for this turn.
  function statsLine(stats = {}) {
    const names = MS() ? { read: 'dibaca', edit: 'disunting', run: 'arahan', search: 'dicari', web: 'internet', agent: 'pembantu' } : { read: 'read', edit: 'edited', run: 'commands', search: 'searched', web: 'web', agent: 'helpers' };
    const parts = Object.entries(names).filter(([k]) => stats[k]).map(([k, label]) => `${label} <b>${stats[k]}</b>`);
    return parts.length ? `<div class="am-hint am-usage">🛠 ${parts.join(' · ')}</div>` : '';
  }
  async function hooks(method, ...args) {
    if (pending) return; pending = true; error = ''; render();
    try { const result = await api[method](...args); if (result.ok) update(result); else error = result.error; }
    catch (failure) { error = failure.message; } finally { pending = false; render(); }
  }
  function update(next) {
    if (!next?.ok || !Array.isArray(next.providers)) return;
    state = next; window.__kopiMonitorIndicator = providers();
    try { askSize(); } catch {}
    // Ignore ticking clocks when deciding to re-render; they are updated in place below.
    const signature = JSON.stringify(providers().map(p => ({ ...p, elapsed: 0, list: p.list?.map(s => ({ ...s, elapsed: 0 })) }))) + (state.history?.[0]?.at || 0);
    if (signature !== lastSignature) {
      lastSignature = signature; render();
      statusReader.textContent = providers().map(p => `${p.name}: ${labels[p.state]}`).join('. ');
    }
    const clock = root.querySelector('.am-clock:not([data-sid])'); if (clock) clock.textContent = `${current()?.elapsed || 0}s`;
    for (const item of current()?.list || []) {
      const el = [...root.querySelectorAll('.am-clock[data-sid]')].find(x => x.dataset.sid === item.id); if (el) el.textContent = `${item.elapsed}s`;
    }
  }
  // ---- Traffic light in the eyes of the ghost (read by drawGhost in mascot.html) ----
  // Bright, saturated colours so they stand out from the normal pale eyes, even in the tiny island.
  const EYES = { running: { color: '#ff9a1f', blink: true }, sending: { color: '#ff9a1f', blink: true }, question: { color: '#ff9a1f' },
    done: { color: '#22e05a' }, error: { color: '#ff3b3b' }, stopped: { color: '#ff3b3b' }, unavailable: { color: '#ff3b3b' } };
  const PRIORITY = ['question', 'error', 'stopped', 'unavailable', 'running', 'sending', 'done'];
  const top = () => providers().filter(shown).sort((a, b) => PRIORITY.indexOf(a.state) - PRIORITY.indexOf(b.state))[0];
  // A colour-blind friendly palette can be chosen in Settings (kopi-fun.js provides it).
  const paletteColour = state => {
    const pal = window.__kopiPalette?.(); if (!pal) return null;
    return { running: pal.busy, sending: pal.busy, question: pal.question, done: pal.done, error: pal.error, stopped: pal.error, unavailable: pal.error }[state] || null;
  };
  window.__kopiEyes = () => { const s = top()?.state, e = EYES[s]; return e ? { ...e, color: paletteColour(s) || e.color } : null; };
  window.__kopiStateColour = s => paletteColour(s) || EYES[s]?.color || null; // your traffic-light colours (Kopi's stage glows in them too)
  // Leaving the Claude Code screen any other way (home, apps, settings) also counts as "seen".
  const oldSetView = setView;
  setView = function (next) { if (next !== 'monitor') markSeen(); return oldSetView(next); };

  // ---- Three sizes: small (rest), medium (compact: music), large (expanded) ----
  const music = () => false; // (no music player in Rehatt)
  // Medium size stays while music plays or a focus timer runs.
  // ...and while it shows a short message (startup "Hoi!", volume bar, battery), so that isn't closed right away.
  const needsAnswer = () => { const p = top(); return Boolean(p && p.state === 'question'); };
  const medium = () => Boolean(window.__kopiFocus?.active()) || Boolean(window.__kopiStretchNudge?.()) || Boolean(window.__kopiCompactMessage?.()) || needsAnswer();
  window.__kopiStatus = () => top();
  let holdClosed = false;
  window.__kopiHoldClosed = () => { holdClosed = true; };
  // While Claude waits for an answer the small island pops open and gets wider (room for the buttons).
  let wideFor = false;
  function askSize() {
    const want = needsAnswer();
    if (want === wideFor) return; wideFor = want;
    if (want && mode !== 'expanded') oldSetMode('compact', false);
    else if (!want && mode === 'compact') { oldSetMode('compact', false); settleSize(); }
  }
  const oldTargetHeight = targetHeight, oldSetMode = setMode, oldDrawExpanded = drawExpanded, oldDrawSmall = drawSmall, oldHover = updateHover;
  targetHeight = function () { return currentView === 'monitor' ? 300 : oldTargetHeight(); };
  // While music plays, the island rests at medium size so the sound wave stays visible.
  setMode = function (next, playSound = true) { return oldSetMode(next === 'rest' && medium() ? 'compact' : next, playSound); };
  function settleSize() {
    if (!introFinished || pointer.known && inside(pointer.x, pointer.y, islandBounds)) return;
    if (medium() && mode === 'rest') setMode('compact', false);
    else if (!medium() && mode === 'compact') oldSetMode('rest', false);
  }
  window.__kopiSettleSize = settleSize;
  setInterval(settleSize, 4000);
  drawExpanded = function (alpha) {
    if (currentView === 'shortcuts') { drawHeader(alpha); drawShortcuts(contentRect()); return; }
    if (currentView !== 'monitor') return oldDrawExpanded(alpha);
    drawHeader(alpha); // the Claude page uses the full width (no Rehatt, usage is shown in the page itself)
    // Claude Code / Codex: Kopi's stage, warm orange for Claude, violet for Codex (like the chat, chat-ui.js)
    // ...and it glows in your traffic-light colour of the moment: busy, a question, done or an error
    const p = current(), st = p?.state;
    if (p?.kind === 'hooks' && p.connected) window.__kopiKopiStage?.(contentRect(), p.agent === 'codex' ? 'codex' : 'claude', busy(p), ['running', 'sending', 'question', 'done', 'error', 'stopped'].includes(st) ? window.__kopiStateColour?.(st) : null);
  };
  function drawLamp(p, x, y) {
    const colour = colourOf(p.state);
    ctx.save(); ctx.globalAlpha = busy(p) ? .6 + .4 * Math.cos(performance.now() / 205) : 1;
    ctx.beginPath(); ctx.arc(x, y, 3.8, 0, Math.PI * 2); ctx.fillStyle = colour; ctx.shadowColor = colour; ctx.shadowBlur = 6; ctx.fill(); ctx.restore();
  }
  const short = (value, max) => { const s = String(value || ''); return s.length > max ? s.slice(0, max - 1) + '…' : s; };
  function drawWave(x, y) {
    const t = performance.now() / 160;
    ctx.save(); ctx.fillStyle = window.__kopiAlbumColour || '#1ed760';
    for (let i = 0; i < 4; i++) {
      const h = 4 + 8 * (0.5 + 0.5 * Math.sin(t + i * 1.7)) * (0.6 + 0.4 * Math.sin(t / 2.3 + i));
      ctx.beginPath(); ctx.roundRect(x + i * 4.5, y - h / 2, 3, h, 1.5); ctx.fill();
    }
    ctx.restore();
  }
  // Medium island: music (or status text) on the left, the ghost with traffic-light eyes far right.
  // Medium island, one clear layout: [left: cover or icon] [middle: wave or text] [right: Rehatt].
  // Rehatt's eyes always show Claude's state; a focus timer is the ring around him.
  // Priority for the middle: short message > Claude needs you > music > focus timer > Claude working.
  let attentionState = '', attentionUntil = 0;
  // The sound wave shows only REAL sound from this PC. Silent (or the sound can't be read) → flat little dots,
  // never a fake wave. Each bar eases to its level, so it rises and settles smoothly.
  const barLevels = {};
  function bars(x0, x1, y, count, maxH = 18) {
    const levels = window.__kopiAudioLevels?.(), w = (x1 - x0) / count, key = count + ':' + Math.round(maxH);
    const shown = barLevels[key] ||= new Array(count).fill(0);
    const loud = levels ? Math.max(...levels) : 0;
    ctx.save(); const colour = window.__kopiAlbumColour || '#1ed760';
    for (let i = 0; i < count; i++) {
      const want = levels && loud > 0.04 ? levels[Math.floor(i * levels.length / count)] : 0;
      shown[i] += (want - shown[i]) * (want > shown[i] ? 0.55 : 0.18);
      const h = Math.max(2, Math.min(maxH, 2 + shown[i] * (maxH - 2)));
      ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, shown[i] * 4); ctx.fillStyle = colour;
      ctx.beginPath(); ctx.roundRect(x0 + i * w + w * 0.2, y - h / 2, w * 0.6, h, 1.5); ctx.fill();
    }
    ctx.restore();
  }
  window.__kopiBars = bars; // also used by the big Spotify player
  function smallStatus(p) {
    if (!EN()) return p.detail || labels[p.state];
    const step = (p.steps || []).filter(x => x.state === 'running').pop();
    if (busy(p)) return step ? `${NOW[step.kind] || 'Working'} ${shortWhat(step.kind, step.what)}` : 'Working';
    return { done: 'Done ✓', question: 'Waiting for you', error: 'Error', stopped: 'Stopped' }[p.state] || 'Idle';
  }
  // The volume in the small island: the speaker, a bar that glides to the new level, and the percentage.
  let volumeShown = null;
  function drawVolume(icon, level, left, cy, right) {
    const k = Math.max(0, Math.min(1, level / 100));
    volumeShown = volumeShown == null ? k : volumeShown + (k - volumeShown) * 0.35;
    text(icon, left + 4, cy + 4, 11.5, '#f2f5ed', 700, 'left');
    const x = left + 30, w = Math.max(60, right - x - 46), h = 6, y = cy - h / 2;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fill();
    if (volumeShown > 0.005) { ctx.beginPath(); ctx.roundRect(x, y, Math.max(h, w * volumeShown), h, h / 2); ctx.fillStyle = '#f2f5ed'; ctx.fill(); }
    ctx.restore();
    text(`${level}%`, right - 4, cy + 4, 11.5, '#f2f5ed', 700, 'right');
  }
  drawSmall = function () {
    if (mode !== 'compact') { oldDrawSmall(); return; }
    const H = islandBounds.height, cy = H / 2, right = islandBounds.x + islandBounds.width, left = islandBounds.x + 12;
    const cover = Math.max(16, H - 12), mid0 = left + cover + 12;
    const p = top(), focus = window.__kopiFocus, now = performance.now();
    const message = window.__kopiCompactMessage?.(), needsYou = p && p.state === 'question';
    const mid1 = right - 52;
    drawGhost(right - 26, cy + 3, Math.min(22, H - 12)); hit.ghost = { x: right - 48, y: 0, width: 44, height: H };
    if (p && p.state !== attentionState) { attentionState = p.state; if (['question', 'done', 'error'].includes(p.state)) attentionUntil = now + 4000; }
    if (!p) attentionState = '';
    const icon = name => window.__kopiIcon?.(name, left + cover / 2, cy, 17);
    const line = (s, colour = '#f2f5ed', x = mid0) => text(s, x, cy + 4, 11.5, colour, 700, 'left', mid1 - x);

    if (message) {
      const volume = /^(\S+) [▮▯]{10} (\d+)%$/u.exec(message); // the volume (extras-ui.js): a real bar instead of block characters
      if (volume) { drawVolume(volume[1], Number(volume[2]), left, cy, mid1); return; }
      text(message, left + 4, cy + 4, 11.5, '#f2f5ed', 700, 'left', mid1 - left); return;
    }
    if (p && (needsYou || now < attentionUntil)) {
      ctx.save(); ctx.globalAlpha = 0.75 + 0.25 * Math.sin(now / 180);
      ctx.beginPath(); ctx.arc(left + cover / 2, cy, 5, 0, Math.PI * 2); ctx.fillStyle = colourOf(p.state); ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10; ctx.fill(); ctx.restore();
      const who = p.provider === 'codex' ? 'Codex' : 'Claude';
      if (p.state === 'question') return line(T(`${who} ada soalan untuk anda`, `${who} has a question for you`)); // hover or click opens it
      return line(`Claude · ${smallStatus(p)}`);
    }
    // a stretch break is due (stretch-ui.js): the kuih's nudge
    if (window.__kopiStretchNudge?.()) { window.__kopiStretchSmall?.(left, cy, cover, mid0, mid1); return; }
    if (focus?.active()) {
      // Timer: a small progress ring + the time left
      const r = cover / 2 - 2, done = 1 - focus.left() / focus.length();
      ctx.save(); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(left + cover / 2, cy, r, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(left + cover / 2, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * done); ctx.strokeStyle = '#ffb35c'; ctx.stroke(); ctx.restore();
      line(focus.label(), '#ffd28a');
      if (p?.state === 'running') text(T('Claude bekerja', 'Claude working'), mid1, cy + 4, 10, '#8f998d', 600, 'right');
      return;
    }
    if (p) { icon('terminal'); line(smallStatus(p)); }
  };  updateHover = function (now) {
    if (currentView === 'monitor') {
      if (mode !== 'expanded') return;
      // Only stay open while you are really typing here (window focused), or while a reply is being sent.
      const typing = document.hasFocus() && root.contains(document.activeElement) && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName);
      if (typing || pending) { leaveStartedAt = null; return; }
      const over = pointer.known && inside(pointer.x, pointer.y, islandBounds);
      if (over) leaveStartedAt = null;
      else { leaveStartedAt ||= now; if (now - leaveStartedAt > (UI.MONITOR_LEAVE_DELAY || 900)) { small(); leaveStartedAt = null; } }
      return;
    }
    // Folded in with the collapse button: stay closed until the mouse has left the island once.
    if (holdClosed) { if (pointer.known && inside(pointer.x, pointer.y, islandBounds)) { hoverStartedAt = null; return; } holdClosed = false; }
    return oldHover(now);
  };
  // ---- Home: a small dashboard. Rehatt on the left, three live widgets: music, Claude, focus ----
  const baseHomeHeight = targetHeight;
  targetHeight = function () { return currentView === 'home' ? (window.__kopiGalleryOpen?.() ? 300 : 200) : currentView === 'shortcuts' ? (editShortcuts ? 286 : 248) : baseHomeHeight(); };
  // A widget card: soft gradient, thin rim, lifts a little on hover. Returns whether the pointer is on it.
  function card(x, y, w, h, key, glow) {
    const bounds = { x, y, width: w, height: h }, over = inside(pointer.x, pointer.y, bounds);
    ctx.save();
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, over ? '#1c211b' : '#151915'); g.addColorStop(1, over ? '#141814' : '#0e110e');
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 16); ctx.fillStyle = g; ctx.fill();
    if (glow) { ctx.clip(); const r = ctx.createRadialGradient(x + 20, y, 0, x + 20, y, w * 0.9); r.addColorStop(0, glow); r.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = over ? 0.22 : 0.14; ctx.fillStyle = r; ctx.fillRect(x, y, w, h); }
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 15.5); ctx.strokeStyle = over ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.07)'; ctx.stroke(); ctx.restore();
    hit[key] = bounds; return over;
  }
  function miniButton(x, y, r, kind, key) {
    const bounds = { x: x - r, y: y - r, width: r * 2, height: r * 2 }, over = inside(pointer.x, pointer.y, bounds);
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = over ? '#ffffff' : '#e8eee4'; ctx.fill();
    ctx.fillStyle = '#050605'; ctx.beginPath();
    if (kind === 'pause') { ctx.roundRect(x - 4, y - 4.5, 3, 9, 1); ctx.roundRect(x + 1, y - 4.5, 3, 9, 1); }
    else { ctx.moveTo(x - 2.5, y - 5); ctx.lineTo(x + 4.5, y); ctx.lineTo(x - 2.5, y + 5); ctx.closePath(); }
    ctx.fill(); ctx.restore();
    hit[key] = bounds;
  }
  const bar = (x, y, w, part, colour) => { box(x, y, w, 4, 2, 'rgba(255,255,255,.1)'); if (part > 0) box(x, y, Math.max(4, w * Math.min(1, part)), 4, 2, colour); };
  // Home (Coucou feel): two dark cards. Left: Claude, with white Kopi, the status and a mini terminal that shows
  // the real work (the code Claude changes in red/green, or what the terminal said). Right: app buttons with
  // little Kopi faces as icons.
  function cardBox(x, y, w, h, key) {
    const bounds = { x, y, width: w, height: h }, over = key && inside(pointer.x, pointer.y, bounds);
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.fillStyle = over ? '#191b1d' : '#141517'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    if (key) hit[key] = bounds; return over;
  }
  // App icon: Rehatt's own line icon on a soft coloured tile.
  // App icons are little Kopi stickers: Kopi himself does something with each app (headphones for Spotify,
  // a laptop for Claude Code, a stopwatch for Focus, peeking out of a box for the Tray …) on a bright tile.
  // Live bits: music notes dance while a song plays, his eyes turn orange while Claude works, the gear turns,
  // the alarm clock shows the real time.
  const ICON_BG = { music: ['#5be38c', '#1fae55'], terminal: ['#ffb38a', '#e8744a'], timer: ['#ffd27a', '#ff9a3d'], tray: ['#8fb8ff', '#4c7ff0'], copy: ['#7fe6d8', '#22b3a3'],
    note: ['#ffe58a', '#f5b92e'], gear: ['#c9b3ff', '#8b6cf0'], stretch: ['#ffb3c9', '#f06a95'], glass: ['#f6cf9f', '#c98a4b'], clock: ['#9fc2ff', '#6c7ff0'], home: ['#d8f5a8', '#9fd45a'], pen: ['#ffb3d6', '#f0609e'] };
  // Hover: Kopi climbs a bit out of his tile, grows and looks ready (happy eyes, glowing light).
  // Click: he squashes and bounces back with a few sparkles.
  const iconAnim = new Map();
  canvas.addEventListener('pointerdown', e => {
    const t = performance.now();
    for (const a of iconAnim.values()) if (a.rect && t - a.seen < 120 && inside(e.clientX, e.clientY, a.rect)) { a.pressAt = t; window.__kopiIconPressAt = t; }
  }, true);
  function appIcon(x, y, size, icon, colour, hot) {
    const c = ctx, now = performance.now(), u = size / 48, bg = ICON_BG[icon] || ICON_BG.home;
    const key = icon + ':' + Math.round(x / 4) + ':' + Math.round(y / 4);
    let st = iconAnim.get(key); if (!st) { st = { h: 0, pressAt: -1e9, seen: 0 }; iconAnim.set(key, st); }
    const hotRect = hot && typeof hot === 'object' ? hot : { x, y, width: size, height: size };
    const over = Boolean(hot) && !homeEdit && pointer.known && inside(pointer.x, pointer.y, hotRect);
    st.h += ((over ? 1 : 0) - st.h) * 0.2; st.rect = hot ? hotRect : null; st.seen = now;
    const h = st.h, since = now - st.pressAt, press = since < 700 ? Math.exp(-since / 170) * Math.sin(since / 38) : 0, tilePress = since < 220 ? Math.sin(Math.min(1, since / 220) * Math.PI) : 0;
    const p = icon === 'terminal' ? top() : null, working = p && busy(p);
    c.save(); c.translate(x, y); c.scale(u, u);
    if (tilePress) { c.translate(24, 24); c.scale(1 - 0.12 * tilePress, 1 - 0.12 * tilePress); c.translate(-24, -24); }
    // tile
    c.save(); c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
    const g = c.createLinearGradient(0, 0, 0, 48); g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]);
    c.beginPath(); c.roundRect(0, 0, 48, 48, 13); c.fillStyle = g; c.fill(); c.restore();
    c.save(); c.beginPath(); c.roundRect(0, 0, 48, 48, 13); c.clip(); c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); c.ellipse(16, 4, 26, 14, -0.2, 0, Math.PI * 2); c.fill(); c.restore();
    const ink = '#1d1b26', hx = 24, hy = icon === 'terminal' ? 23 : icon === 'tray' ? 27 : 26;
    const eyesCol = icon === 'terminal' && working ? '#ff9a3d' : '#5fd0ff';
    // Kopi's head
    const head = () => {
      if (!['music', 'gear', 'home'].includes(icon)) { c.strokeStyle = '#e8efec'; c.lineWidth = 1.8; c.lineCap = 'round'; c.beginPath(); c.moveTo(hx, hy - 10); c.lineTo(hx, hy - 15); c.stroke(); c.beginPath(); c.arc(hx, hy - 16.5, 2.2 + 0.6 * h, 0, Math.PI * 2); c.fillStyle = working ? '#ff9a3d' : '#c6e994'; c.shadowColor = c.fillStyle; c.shadowBlur = 8 * h; c.fill(); c.shadowBlur = 0; }
      c.fillStyle = '#dfe9e5'; c.beginPath(); c.roundRect(hx - 15.5, hy - 2, 3, 6, 1.5); c.roundRect(hx + 12.5, hy - 2, 3, 6, 1.5); c.fill();
      const hg = c.createLinearGradient(0, hy - 12, 0, hy + 12); hg.addColorStop(0, '#ffffff'); hg.addColorStop(1, '#dbe7e2');
      c.beginPath(); c.ellipse(hx, hy, 14, 11.5, 0, 0, Math.PI * 2); c.fillStyle = hg; c.fill(); c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 0.8; c.stroke();
      c.beginPath(); c.roundRect(hx - 10, hy - 5.5, 20, 12, 5.5); c.fillStyle = ink; c.fill();
      c.fillStyle = eyesCol; c.strokeStyle = eyesCol; c.lineWidth = 1.6; c.lineCap = 'round';
      const blink = Math.floor(now / 3200 + size) % 7 === 0 && (now % 3200) < 140;
      for (const s of [-1, 1]) {
        const ex = hx + s * 4.3, ey = hy + 0.5;
        if (icon === 'music' || st.ready) { c.beginPath(); c.arc(ex, ey + 1.6, 2.2, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
        else if (icon === 'timer' || icon === 'terminal') { c.beginPath(); c.ellipse(ex, ey, 2, 1.3, 0, 0, Math.PI * 2); c.fill(); }
        else if (blink) { c.beginPath(); c.moveTo(ex - 2, ey); c.lineTo(ex + 2, ey); c.stroke(); }
        else { c.beginPath(); c.ellipse(ex, ey, 1.7, 2.7, 0, 0, Math.PI * 2); c.fill(); }
      }
    };
    if (h > 0.02) { c.save(); c.fillStyle = 'rgba(0,0,0,' + (0.22 * h) + ')'; c.beginPath(); c.ellipse(24, 43, 13 + 3 * h, 2.5, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
    c.save(); // everything below is "Kopi": it climbs out of the frame on hover and squashes on click
    const lift = 9 * h + Math.sin(now / 260) * 0.8 * h, grow = 1 + 0.2 * h;
    c.translate(24, 44); c.scale(grow * (1 + 0.26 * press), grow * (1 - 0.26 * press)); c.translate(-24, -44 - lift / grow);
    if (h > 0.55 && !['music', 'timer', 'terminal'].includes(icon)) st.ready = true; else st.ready = false;
    head();
    if (icon === 'tray') { // peeking out of a box
      c.fillStyle = '#2f5fc4'; c.beginPath(); c.roundRect(7, 30, 34, 14, 3); c.fill(); c.fillStyle = '#3d70dc'; c.beginPath(); c.roundRect(5, 28, 38, 5, 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.roundRect(19, 36, 10, 2.5, 1.2); c.fill();
    }
    if (icon === 'music') { // headphones + dancing notes
      c.strokeStyle = ink; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.arc(hx, hy + 2, 15.5, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
      c.fillStyle = '#1aa34c'; c.strokeStyle = ink; c.lineWidth = 1.2; for (const s of [-1, 1]) { c.beginPath(); c.roundRect(hx + s * 15.5 - 3, hy - 3, 6, 10, 3); c.fill(); c.stroke(); }
      const bob = 0, bob2 = 0;
      c.fillStyle = '#ffffff'; c.strokeStyle = '#ffffff'; c.lineWidth = 1.4;
      c.beginPath(); c.ellipse(39, 12 + bob, 2.2, 1.7, -0.4, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(41, 11.5 + bob); c.lineTo(41, 5 + bob); c.lineTo(44, 6 + bob); c.stroke();
      c.globalAlpha = 0.85; c.beginPath(); c.ellipse(8, 9 + bob2, 1.8, 1.4, -0.4, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(9.6, 8.6 + bob2); c.lineTo(9.6, 3.5 + bob2); c.stroke(); c.globalAlpha = 1;
    }
    if (icon === 'terminal') { // a little laptop in front of him
      c.fillStyle = '#2b2a35'; c.beginPath(); c.roundRect(12, 30, 24, 13, 2); c.fill();
      c.fillStyle = '#ff9a3d'; c.font = 'bold 8px Consolas, monospace'; c.textBaseline = 'middle'; c.fillText('>_', 16, 36.5);
      c.fillStyle = '#c9c7d6'; c.beginPath(); c.moveTo(8, 43); c.lineTo(40, 43); c.lineTo(38, 46); c.lineTo(10, 46); c.closePath(); c.fill();
    }
    if (icon === 'timer') { // stopwatch
      const sx = 35.5, sy = 36; c.fillStyle = '#ffffff'; c.strokeStyle = '#e8743a'; c.lineWidth = 2; c.beginPath(); c.arc(sx, sy, 7.5, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#e8743a'; c.beginPath(); c.roundRect(sx - 1.5, sy - 11.5, 3, 3, 1); c.fill();
      const f = window.__kopiFocus, part = f?.active() ? 1 - f.left() / (f.length() || 1) : (now / 6000) % 1;
      c.strokeStyle = ink; c.lineWidth = 1.4; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + Math.sin(part * Math.PI * 2) * 5, sy - Math.cos(part * Math.PI * 2) * 5); c.stroke();
    }
    if (icon === 'copy') { // holding a clipboard
      c.fillStyle = '#8a5a2b'; c.beginPath(); c.roundRect(14, 30, 20, 16, 2.5); c.fill(); c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect(16, 32.5, 16, 12, 1.5); c.fill();
      c.fillStyle = '#9aa3a8'; c.beginPath(); c.roundRect(20, 28.5, 8, 4, 1.5); c.fill(); c.fillStyle = '#22b3a3'; for (let i = 0; i < 3; i++) c.fillRect(18, 35 + i * 3, 12 - i * 3, 1.2);
    }
    if (icon === 'note') { // a sheet of paper and a pencil
      c.save(); c.translate(24, 38); c.rotate(-0.08); c.fillStyle = '#fffdf2'; c.beginPath(); c.roundRect(-10, -7, 20, 13, 1.5); c.fill(); c.fillStyle = '#e6c25a'; for (let i = 0; i < 3; i++) c.fillRect(-7, -4 + i * 3, 13 - (i === 2 ? 5 : 0), 1); c.restore();
      c.save(); c.translate(36, 33); c.rotate(0.7); c.fillStyle = '#ff6b6b'; c.fillRect(-1.6, -9, 3.2, 3); c.fillStyle = '#ffcc33'; c.fillRect(-1.6, -6, 3.2, 10); c.fillStyle = '#f2d7b0'; c.beginPath(); c.moveTo(-1.6, 4); c.lineTo(1.6, 4); c.lineTo(0, 7.5); c.closePath(); c.fill(); c.restore();
    }
    if (icon === 'gear') { // a gear turning on his head
      c.save(); c.translate(hx, hy - 16); c.rotate(now / 1400); c.fillStyle = '#ffffff'; c.beginPath();
      for (let i = 0; i < 16; i++) { const ang = i / 16 * Math.PI * 2, r = i % 2 ? 5 : 7; c.lineTo(Math.cos(ang) * r, Math.sin(ang) * r); } c.closePath(); c.fill();
      c.fillStyle = '#8b6cf0'; c.beginPath(); c.arc(0, 0, 2.2, 0, Math.PI * 2); c.fill(); c.restore();
    }
    if (icon === 'clock') { // alarm clock with the real time
      const cx2 = 35.5, cy2 = 36, d = new Date(); c.fillStyle = '#ff6b6b'; c.beginPath(); c.arc(cx2 - 5, cy2 - 7, 2.5, 0, Math.PI * 2); c.arc(cx2 + 5, cy2 - 7, 2.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; c.strokeStyle = '#ff6b6b'; c.lineWidth = 2; c.beginPath(); c.arc(cx2, cy2, 7.5, 0, Math.PI * 2); c.fill(); c.stroke();
      const hand = (ang, len, w) => { c.lineWidth = w; c.beginPath(); c.moveTo(cx2, cy2); c.lineTo(cx2 + Math.sin(ang) * len, cy2 - Math.cos(ang) * len); c.stroke(); };
      c.strokeStyle = ink; c.lineCap = 'round'; hand(((d.getHours() % 12) + d.getMinutes() / 60) / 12 * Math.PI * 2, 3.5, 1.6); hand(d.getMinutes() / 60 * Math.PI * 2, 5.2, 1.1);
    }
    if (icon === 'stretch') { // arms up, stretching (they wave a little higher on hover)
      const up = 3 * h + Math.sin(now / 420) * 1.2; c.strokeStyle = '#ffffff'; c.lineWidth = 2.6; c.lineCap = 'round';
      c.beginPath(); c.moveTo(hx - 13, hy + 2); c.lineTo(hx - 19, hy - 12 - up); c.moveTo(hx + 13, hy + 2); c.lineTo(hx + 19, hy - 12 - up); c.stroke();
      c.fillStyle = '#ffffff'; for (const s of [-1, 1]) { c.beginPath(); c.arc(hx + s * 19.5, hy - 13.5 - up, 2.4, 0, Math.PI * 2); c.fill(); }
    }
    if (icon === 'glass') { // holding a glass of teh tarik
      const gx = 33, gy = 29; c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + 11, gy); c.lineTo(gx + 9.5, gy + 15); c.lineTo(gx + 1.5, gy + 15); c.closePath(); c.fill();
      c.fillStyle = '#b8743a'; c.beginPath(); c.moveTo(gx + 0.9, gy + 5); c.lineTo(gx + 10.1, gy + 5); c.lineTo(gx + 9.2, gy + 14); c.lineTo(gx + 1.8, gy + 14); c.closePath(); c.fill();
      c.fillStyle = '#f3e2c7'; c.fillRect(gx + 0.9, gy + 3.5, 9.2, 2);
    }
    if (icon === 'home') { // a little roof as a hat
      c.fillStyle = '#e4572e'; c.beginPath(); c.moveTo(hx - 13, hy - 9); c.lineTo(hx, hy - 20); c.lineTo(hx + 13, hy - 9); c.closePath(); c.fill(); c.fillStyle = '#b8401f'; c.fillRect(hx + 5, hy - 19, 3, 6);
    }
    c.restore(); // end of Kopi
    if (since < 380) { // sparkles
      const k = since / 380; c.fillStyle = '#ffffff';
      for (let i = 0; i < 7; i++) { const ang = i / 7 * Math.PI * 2 + 0.3, rr = 18 + 16 * k; c.globalAlpha = 1 - k; c.beginPath(); c.arc(24 + Math.cos(ang) * rr, 26 + Math.sin(ang) * rr, 2.2 * (1 - k) + 0.6, 0, Math.PI * 2); c.fill(); }
      c.globalAlpha = 1;
    }
    c.restore();
  }
  window.__kopiAppIcon = appIcon;
  function mono(str, x, y, size, colour, maxW) {
    ctx.save(); ctx.font = `${size}px "Cascadia Code", Consolas, monospace`; ctx.fillStyle = colour; ctx.textBaseline = 'alphabetic';
    let s = String(window.__kopiTr?.(String(str || '')) ?? str ?? ''); if (maxW) while (s.length > 1 && ctx.measureText(s).width > maxW) s = s.slice(0, -2) + '…';
    ctx.fillText(s, x, y); ctx.restore();
  }
  // ---- Home = widgets. Every app is a widget: Small (1 cell), Wide (2×1) or Large (2×2), on a 4 × 2 grid.
  // So 8 small ones, 2 big ones, or anything in between. Press + to edit (iPhone style): everything wiggles,
  // − removes, the arrow badge changes the size, hold and drag to move, empty spots get a + to add a widget.
  const SIZES = { S: [1, 1], W: [2, 1], L: [2, 2] }, SIZE_NAME = { S: 'Small', W: 'Wide', L: 'Large' }, COLS = 4, ROWS = 2;
  const PRESETS = [
    { name: 'Standard', list: [['claude', 'L'], ['stretch', 'W'], ['meter', 'S'], ['focus', 'S']] },
    { name: '8 small', list: ['claude', 'stretch', 'meter', 'focus', 'clock', 'tray', 'clips', 'note'].map(id => [id, 'S']) },
    { name: '2 large', list: [['claude', 'L'], ['stretch', 'L']] },
    { name: '4 wide', list: [['claude', 'W'], ['stretch', 'W'], ['meter', 'W'], ['focus', 'W']] },
    { name: 'Rehat', list: [['stretch', 'L'], ['meter', 'W'], ['claude', 'W']] }
  ];
  let homeEdit = false, gallery = null, drag = null, swallowClick = false, longPress = null, homeGeo = null, widgets = null, cell = { w: 171, h: 64, gap: 8 };
  const anim = {};
  // Lay widgets out: everyone keeps their spot if it is free, the rest fill the first free spot (like iPhone).
  function arrange(list, fixedId) {
    const used = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    const free = (c, r, w, h) => { if (c == null || r == null || c < 0 || r < 0 || c + w > COLS || r + h > ROWS) return false; for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (used[y][x]) return false; return true; };
    const take = (c, r, w, h) => { for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) used[y][x] = true; };
    const out = list.map(w => ({ id: w.id, size: w.size, c: w.c, r: w.r, cw: SIZES[w.size][0], ch: SIZES[w.size][1] }));
    const order = [...out.filter(w => w.id === fixedId), ...out.filter(w => w.id !== fixedId)];
    for (const w of order) if (free(w.c, w.r, w.cw, w.ch)) { take(w.c, w.r, w.cw, w.ch); w.ok = true; }
    for (const w of order) {
      if (w.ok) continue;
      let spot = null;
      for (let r = 0; r <= ROWS - w.ch && !spot; r++) for (let c = 0; c <= COLS - w.cw && !spot; c++) if (free(c, r, w.cw, w.ch)) spot = { c, r };
      if (spot) { w.c = spot.c; w.r = spot.r; take(spot.c, spot.r, w.cw, w.ch); w.ok = true; } else w.hidden = true;
    }
    return { placed: out, used, ok: out.every(w => !w.hidden) };
  }
  function loadWidgets() {
    try { const v = JSON.parse(localStorage.getItem('kopi:widgets')); if (Array.isArray(v)) return arrange(v.filter(w => APPS[w.id] && SIZES[w.size])).placed.filter(w => !w.hidden); } catch {}
    // first time: start from the old home (Claude big + your shortcuts, on the side you chose)
    const old = shortcuts().filter(id => id !== 'claude').map(id => ({ id, size: 'S' }));
    let swap = false; try { swap = localStorage.getItem('kopi:homeSwap') === '1'; } catch {}
    const claude = { id: 'claude', size: 'L' };
    return arrange(swap ? [...old.slice(0, 2), claude, ...old.slice(2)] : [claude, ...old]).placed.filter(w => !w.hidden);
  }
  const getWidgets = () => widgets || (widgets = loadWidgets());
  function saveWidgets(placed) {
    widgets = placed.filter(w => !w.hidden).map(({ id, size, c, r }) => ({ id, size, c, r }));
    try { localStorage.setItem('kopi:widgets', JSON.stringify(widgets)); } catch {}
  }
  const presetLayout = p => arrange(p.list.filter(([id]) => APPS[id]).map(([id, size]) => ({ id, size })));

  window.__kopiHomeEdit = on => { homeEdit = on ?? !homeEdit; setGallery(null); drag = null; sound('click'); };
  window.__kopiHomeEditing = () => homeEdit;
  window.__kopiWidgetsReload = () => { widgets = null; }; // after the saved layout changed outside the app
  window.__kopiGallery = () => openGallery();
  window.__kopiGalleryOpen = () => Boolean(gallery);
  setInterval(() => { if ((homeEdit || gallery) && (currentView !== 'home' || mode !== 'expanded')) { homeEdit = false; setGallery(null); drag = null; } }, 300);

  // live data for the note and clipboard widgets
  let noteText = '', clipList = [];
  function refreshWidgetData() {
    const on = getWidgets().map(w => w.id).concat(gallery ? [gallery.pick] : []);
    if (on.includes('note')) api?.noteGet?.().then(r => { if (r?.ok) noteText = r.text || ''; }).catch(() => {});
    if (on.includes('clips')) api?.clipsGet?.().then(r => { if (r?.ok) clipList = (r.clips || []).map(c => c.text || ''); }).catch(() => {});
  }
  setInterval(() => { if (currentView === 'home' && mode === 'expanded') refreshWidgetData(); }, 2500);
  api?.onClips?.(r => { clipList = (r?.clips || []).map(c => c.text || ''); });

  // ---- drawing helpers ----
  const wiggle = seed => homeEdit && !gallery ? Math.sin(performance.now() / 65 + seed * 1.9) * 0.012 : 0;
  function withWiggle(r, seed, fn) { ctx.save(); ctx.translate(r.x + r.width / 2, r.y + r.height / 2); ctx.rotate(wiggle(seed)); ctx.translate(-(r.x + r.width / 2), -(r.y + r.height / 2)); fn(); ctx.restore(); }
  function widgetBg(r, key) {
    const over = key && inside(pointer.x, pointer.y, r);
    ctx.save(); ctx.beginPath(); ctx.roundRect(r.x, r.y, r.width, r.height, 16); ctx.fillStyle = over ? '#1b1d20' : '#141517'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    if (key) hit[key] = r;
  }
  function wbtn(x, y, rad, kind, key, primary, live) {
    const b = { x: x - rad, y: y - rad, width: rad * 2, height: rad * 2 }, over = live && inside(pointer.x, pointer.y, b);
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fillStyle = primary ? (over ? '#ffffff' : '#eef2ec') : over ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.07)'; ctx.fill(); ctx.restore();
    const ink = primary ? '#0b0c0d' : '#e8ece6';
    if (kind === 'stop') { ctx.save(); ctx.fillStyle = ink; ctx.beginPath(); ctx.roundRect(x - rad * 0.3, y - rad * 0.3, rad * 0.6, rad * 0.6, 2); ctx.fill(); ctx.restore(); }
    else window.__kopiMediaIcon?.(kind, x, y, rad * 0.72, ink);
    if (live) hit[key] = b;
  }
  function wrapLines(str, maxW, size, max) {
    ctx.save(); ctx.font = `500 ${size}px "Segoe UI Variable Text", "Segoe UI", Arial, sans-serif`;
    const out = [];
    for (const para of String(str || '').split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? line + ' ' + word : word;
        if (ctx.measureText(next).width > maxW && line) { out.push(line); line = word; } else line = next;
        if (out.length >= max) break;
      }
      if (out.length >= max) break;
      if (line) out.push(line);
    }
    ctx.restore(); return out.slice(0, max);
  }
  function smooth(id, t) { // widgets glide to their new spot while you edit
    if (!homeEdit) { anim[id] = { ...t }; return t; }
    const a = anim[id] || (anim[id] = { ...t }), k = 0.28;
    for (const p of ['x', 'y', 'width', 'height']) a[p] += (t[p] - a[p]) * k;
    return { ...a };
  }
  function badge(x, y, kind) { // − / + / resize bubble
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fillStyle = kind === '+' ? '#c6e994' : '#3b3e42'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 6; ctx.fill(); ctx.restore();
    ctx.save(); ctx.strokeStyle = kind === '+' ? '#10180c' : '#fff'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    if (kind === 'size') { ctx.moveTo(x - 3.5, y + 3.5); ctx.lineTo(x + 3.5, y - 3.5); ctx.moveTo(x + 0.5, y - 3.5); ctx.lineTo(x + 3.5, y - 3.5); ctx.lineTo(x + 3.5, y - 0.5); ctx.moveTo(x - 3.5, y + 0.5); ctx.lineTo(x - 3.5, y + 3.5); ctx.lineTo(x - 0.5, y + 3.5); }
    else { ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); if (kind === '+') { ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); } }
    ctx.stroke(); ctx.restore();
  }

  // ---- the widgets themselves ----
  function claudeInfo() {
    const p = top(), st = p ? p.state : 'ready';
    const agentName = p?.name || 'AI', project = p?.source?.title && p.source.title !== 'No active session' ? p.source.title : agentName;
    const statusText = !p ? 'Waiting for your AI' : st === 'question' ? 'Waiting for you' : busy(p) ? (p.detail || 'Working') : st === 'done' ? 'Done' : st === 'error' ? (p.detail || 'Error') : 'Idle';
    const lastLine = p?.code && busy(p) ? '+ ' + (p.code.lines.find(l => l.t !== '-')?.text || p.code.file) : p?.run ? (p.run.out.slice(-1)[0] || '$ ' + p.run.command) : String(p?.lastMessage || '').split('\n').filter(Boolean)[0] || '';
    return { p, st, project, statusText, dot: p ? colourOf(st) : '#4a504c', lastLine };
  }
  function statusIcon(x, y, st, dot, p) {
    if (st === 'done') { ctx.save(); ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = dot; ctx.fill(); ctx.strokeStyle = '#0d0e0f'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x - 2.7, y); ctx.lineTo(x - 0.7, y + 2); ctx.lineTo(x + 2.8, y - 2.4); ctx.stroke(); ctx.restore(); }
    else if (p && busy(p)) { ctx.save(); ctx.translate(x, y); ctx.rotate(performance.now() / 160); ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 1.4); ctx.strokeStyle = dot; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore(); }
    else { ctx.save(); ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.strokeStyle = dot; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore(); }
  }
  // Each AI has its own colour (the same as in Rehatt → Connections).
  const AI_COLOUR = { claudecode: '#d97757', codex: '#3b82f6' };
  // All chats going on at once, across AIs: every Claude Code / Codex session, plus the ChatGPT and Claude chats.
  function activeChats() {
    const out = [];
    for (const q of providers().filter(shown)) {
      if (q.kind === 'hooks' && q.list?.length) q.list.forEach(s => out.push({ provider: q.provider, id: s.id, state: s.state, name: q.name, project: s.project }));
      else out.push({ provider: q.provider, id: q.provider, state: q.state, name: q.name, project: q.source?.title || '' });
    }
    return out.sort((a, b) => PRIORITY.indexOf(a.state) - PRIORITY.indexOf(b.state));
  }
  // A small bot in an AI's colour with a status light on its cheek (it bobs while that AI works).
  function miniBot(x, y, w, colour, lamp, working, current) {
    const h = w * 0.8, bob = working ? Math.sin(performance.now() / 180 + x) * 1.5 : 0;
    ctx.save(); ctx.translate(0, bob);
    ctx.beginPath(); ctx.roundRect(x, y, w, h, h * 0.42); ctx.fillStyle = colour; ctx.fill();
    if (current) { ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke(); }
    ctx.fillStyle = '#141414';
    for (const ex of [0.36, 0.64]) { ctx.beginPath(); ctx.roundRect(x + w * ex - 1.4, y + h * 0.34, 2.8, h * 0.32, 1.4); ctx.fill(); }
    ctx.beginPath(); ctx.arc(x + w - 1, y + h - 1, 3.2, 0, Math.PI * 2); ctx.fillStyle = lamp; ctx.shadowColor = lamp; ctx.shadowBlur = 5; ctx.fill();
    ctx.restore();
  }
  const CHAT_WORDS = { running: 'Working', sending: 'Working', question: 'Waiting for you', done: 'Done', error: 'Error', ready: 'Idle' };
  // Nothing going on: which AIs Kopi is watching (or where to connect one).
  function drawIdleAi(tx, y, tw, h, live) {
    const watching = providers().filter(q => q.connected || q.hooksInstalled), last = state.history?.[0];
    const hungry = window.__kopiHomeTitle?.(); // "I'm hungry… finish a task 🍪" (kopi-fun.js) instead of "Idle"
    text(hungry || 'Idle', tx, y + 30, hungry ? 13 : 14, hungry ? '#ffc27a' : '#f2f5ef', 700, 'left', tw);
    if (last) { // the last job, so a quiet card still tells you something (click it for the whole list)
      const word = { done: T('✓ Siap', '✓ Done'), question: T('● Soalan', '● Question'), error: T('✕ Ralat', '✕ Error') }[last.result] || '', colour = { done: '#7ef0a4', question: '#ffc27a', error: '#ff9a9a' }[last.result] || '#aab2ad';
      const at = new Date(last.at).toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit' });
      text(`${T('Terakhir', 'Last')}: ${last.prompt}`, tx, y + 50, 11, '#c9d0cb', 600, 'left', tw - 70);
      text(word, tx + tw, y + 50, 10.5, colour, 700, 'right');
      text(`${at}${last.project ? ' · ' + last.project : ''}`, tx, y + 65, 10, '#7d847f', 500, 'left', tw);
    } else text(watching.length ? T('Kopi akan beritahu apabila AI anda siap atau bertanya sesuatu.', 'Kopi tells you when your AI is done or asks something.') : T('Sambungkan AI anda dalam Rehatt → Sambungan.', 'Connect your AI in Rehatt → Connections.'), tx, y + 50, 11, '#8a918c', 500, 'left', tw);
    watching.slice(0, 4).forEach((q, i) => {
      const bx = tx + i * 70, by = y + h - 44;
      miniBot(bx, by, 20, AI_COLOUR[q.provider] || '#aaa', q.connected ? colourOf(q.state === 'disconnected' ? 'ready' : q.state) : '#4a504c', false, false);
      text(q.name, bx + 26, by + 12, 10, '#aab2ad', 600, 'left', 44);
    });
  }
  // Several chats at once (two Claude Code sessions, Codex and ChatGPT…): a short summary and one row each.
  function drawChatList(chats, tx, y, tw, h, live) {
    const count = s => chats.filter(c => (s === 'busy' ? busy(c) : c.state === s)).length;
    const parts = [[count('busy'), T('sedang bekerja', 'working')], [count('question'), T('menunggu anda', 'waiting for you')], [count('done'), T('siap', 'done')]].filter(([n]) => n).map(([n, w]) => `${n} ${w}`);
    text(`${chats.length} chats`, tx, y + 29, 14, '#f2f5ef', 700, 'left', tw * 0.4);
    text(parts.join(' · '), tx + tw, y + 29, 11, '#8a918c', 600, 'right', tw * 0.6);
    const top = y + 42, rowH = Math.max(22, Math.min(28, (h - 54) / Math.min(chats.length, 4))), rows = Math.max(1, Math.floor((h - 50) / rowH));
    chats.slice(0, rows).forEach((c, i) => {
      const ry = top + i * rowH, over = live && inside(pointer.x, pointer.y, { x: tx - 6, y: ry, width: tw + 6, height: rowH });
      if (over) { ctx.save(); ctx.beginPath(); ctx.roundRect(tx - 6, ry, tw + 6, rowH - 2, 8); ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fill(); ctx.restore(); }
      miniBot(tx, ry + rowH / 2 - 8, 20, AI_COLOUR[c.provider] || '#aaa', colourOf(c.state), busy(c), false);
      text(c.project && c.project !== c.name ? c.project : c.name, tx + 30, ry + rowH / 2 + 4, 11.5, '#e8ece6', 650, 'left', tw * 0.45);
      if (c.project && c.project !== c.name) text(c.name, tx + 30 + Math.min(tw * 0.45, c.project.length * 6.6) + 6, ry + rowH / 2 + 4, 10, '#7d847f', 600, 'left', tw * 0.2);
      text(CHAT_WORDS[c.state] || '', tx + tw, ry + rowH / 2 + 4, 10.5, colourOf(c.state), 700, 'right');
      if (live) hit['aichip_' + i] = { x: tx - 6, y: ry, width: tw + 6, height: rowH, provider: c.provider };
    });
    if (chats.length > rows) text(T(`+ ${chats.length - rows} lagi`, `+ ${chats.length - rows} more`), tx + tw, y + h - 8, 10, '#6b726e', 600, 'right');
  }
  function drawClaudeCard(lx, y, leftW, h, live) {
    const { p, st, project, statusText, dot } = claudeInfo(), agentName = p?.name || 'AI';
    cardBox(lx, y, leftW, h, live ? 'monitor_claudecode' : null);
    const kopi = Math.min(70, h * 0.55);
    drawGhost(lx + 52, y + h / 2 - 2, kopi);
    if (live) hit.ghost = { x: lx + 14, y: y + 18, width: 76, height: h - 36 };
    const tx = lx + 100, tw = leftW - 112;
    for (const key of Object.keys(hit)) if (key.startsWith('aichip_')) delete hit[key];
    // Three calm versions of this card: nothing going on, a chat app (ChatGPT / Claude), or several chats at once.
    const chats = activeChats();
    if (chats.length > 1) return drawChatList(chats, tx, y, tw, h, live);
    if (!p) return drawIdleAi(tx, y, tw, h, live);
    ctx.save(); ctx.beginPath(); ctx.arc(tx + 4, y + 21, 3.6, 0, Math.PI * 2); ctx.fillStyle = dot; if (p) { ctx.shadowColor = dot; ctx.shadowBlur = 6; } ctx.fill(); ctx.restore();
    text(project, tx + 14, y + 25, 12.5, '#f2f5ef', 700, 'left', tw * 0.55);
    if (project !== agentName) text(agentName, tx + 14 + Math.min(tw * 0.55, project.length * 7.4) + 8, y + 25, 11, '#7d847f', 500, 'left', tw * 0.35);
    const steps = p?.steps || [], doneSteps = steps.filter(s => s.state === 'done').length;
    if (steps.length) text(`${doneSteps}/${steps.length}`, tx + tw, y + 25, 10.5, '#7d847f', 600, 'right');
    const sx = tx + 2, sy = y + 44;
    statusIcon(sx + 5, sy - 4, st, dot, p);
    const summary = st === 'done' && p?.run?.out?.length ? (p.run.out.find(l => /pass|passed|ok|success|berjaya/i.test(l)) || '') : '';
    text(statusText, sx + 16, sy, 11.5, p ? (st === 'done' ? dot : '#e8ece6') : '#8a918c', 700, 'left', tw * 0.5);
    // your 5-hour Claude limit, once it starts to matter
    const lim = usage().fiveHour;
    if (lim && lim.used >= 50) {
      const c = ringColour(lim.used), bw = 74, bx = tx + tw - bw, pulse = lim.used >= 90 ? 0.65 + 0.35 * Math.cos(performance.now() / 260) : 1;
      ctx.save(); ctx.globalAlpha = pulse; text(`${T('Had', 'Limit')} ${lim.used}%`, tx + tw, sy - 2, 10.5, c, 800, 'right');
      ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.beginPath(); ctx.roundRect(bx, sy + 3, bw, 3, 1.5); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(bx, sy + 3, bw * Math.min(1, lim.used / 100), 3, 1.5); ctx.fill(); ctx.restore();
    }
    if (summary.trim()) text(summary.trim(), sx + 16 + Math.min(tw * 0.5, statusText.length * 7) + 8, sy, 11, '#aab2ad', 500, 'left', tw * 0.45);
    const bx = tx, by = y + 54, bw = tw, bh = h - 66;
    if (bh < 20) return;
    ctx.save(); ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 10); ctx.fillStyle = '#0b0c0d'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.stroke(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 10); ctx.clip();
    const lh = 13, mx = bx + 10;
    if (p?.code && busy(p)) {
      mono(p.code.file, mx, by + 14, 9.5, '#7ab8ff', bw - 20);
      p.code.lines.slice(0, Math.floor((bh - 22) / lh)).forEach((l, i) => {
        const ly = by + 22 + i * lh;
        ctx.fillStyle = l.t === '-' ? 'rgba(255,80,80,.14)' : 'rgba(60,220,120,.13)'; ctx.fillRect(bx + 4, ly - 1, bw - 8, lh);
        mono((l.t === '-' ? '- ' : '+ ') + l.text, mx, ly + 9.5, 9.5, l.t === '-' ? '#ff8f8f' : '#7ee6a2', bw - 20);
      });
    } else if (p?.run) {
      mono('$ ' + p.run.command, mx, by + 14, 9.5, '#cfd5d1', bw - 20);
      p.run.out.slice(-Math.floor((bh - 20) / lh)).forEach((l, i) => {
        const good = /\bpass(ed)?\b|✓|success/i.test(l), bad = /\bfail(ed)?\b|error|✕/i.test(l);
        mono(l, mx, by + 28 + i * lh, 9.5, good ? '#7ee6a2' : bad ? '#ff8f8f' : '#8a918c', bw - 20);
      });
    } else if (p?.lastMessage) {
      String(p.lastMessage).split('\n').filter(Boolean).slice(0, Math.floor((bh - 8) / lh)).forEach((l, i) => mono(l, mx, by + 15 + i * lh, 9.5, '#aab2ad', bw - 20));
    } else {
      mono(p ? '…' : '$ claude', mx, by + 15, 9.5, '#5d6460', bw - 20);
      if (!p) mono('Rehatt follows it by itself', mx, by + 28, 9.5, '#3f4542', bw - 20);
    }
    ctx.restore();
  }
  function claudeWidget(w, r) {
    const { p, st, project, statusText, dot, lastLine } = claudeInfo(), small = w.size === 'S';
    const rs = small ? Math.min(34, r.height * 0.5) : Math.min(44, r.height * 0.62);
    drawGhost(r.x + (small ? 28 : 36), r.y + r.height / 2, rs);
    const tx = r.x + (small ? 54 : 70), tw = r.x + r.width - tx - 12, my = r.y + r.height / 2;
    if (small) {
      text(project, tx, my - 3, 12, '#f2f5ef', 700, 'left', tw);
      text(statusText, tx, my + 13, 10.5, p ? (st === 'done' ? dot : '#c9d0cb') : '#8a918c', 600, 'left', tw);
      return;
    }
    ctx.save(); ctx.beginPath(); ctx.arc(tx + 4, my - 15, 3.6, 0, Math.PI * 2); ctx.fillStyle = dot; ctx.fill(); ctx.restore();
    text(project, tx + 14, my - 11, 12.5, '#f2f5ef', 700, 'left', tw - 14);
    statusIcon(tx + 5, my + 2, st, dot, p);
    text(statusText, tx + 16, my + 6, 11.5, p ? (st === 'done' ? dot : '#e8ece6') : '#8a918c', 700, 'left', tw - 16);
    if (lastLine && r.height > 56) mono(lastLine, tx, my + 22, 9.5, '#7d847f', tw);
  }
  function focusWidget(w, r, live) {
    const f = window.__kopiFocus; if (!f) return genericWidget(w, r);
    const on = f.active(), part = on ? Math.min(1, Math.max(0, 1 - f.left() / (f.length() || 1))) : 0, label = on ? f.label() : `${f.minutes()}:00`;
    const ring = (cx, cy, rad, lw) => {
      ctx.save(); ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,179,92,.16)'; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
      if (part > 0) { ctx.strokeStyle = '#ffb35c'; ctx.beginPath(); ctx.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + part * Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    };
    if (w.size === 'S') {
      ring(r.x + 30, r.y + r.height / 2, 17, 3.5); window.__kopiIcon?.('timer', r.x + 30, r.y + r.height / 2, 16, '#ffd3a1');
      text(label, r.x + 58, r.y + r.height / 2 - 1, 15, '#fff', 700, 'left', r.width - 66);
      text(on ? T('Fokus berjalan', 'Focus running') : 'Focus', r.x + 58, r.y + r.height / 2 + 14, 10.5, '#8f998d', 500, 'left', r.width - 66);
      return;
    }
    if (w.size === 'W') {
      const rad = r.height / 2 - 12; ring(r.x + 14 + rad, r.y + r.height / 2, rad, 4); window.__kopiIcon?.('timer', r.x + 14 + rad, r.y + r.height / 2, 18, '#ffd3a1');
      text(label, r.x + rad * 2 + 30, r.y + r.height / 2 + 2, 20, '#fff', 700);
      text(on ? T('Kekal fokus', 'Stay focused') : 'Focus', r.x + rad * 2 + 30, r.y + r.height / 2 + 17, 10.5, '#8f998d', 500);
      wbtn(r.x + r.width - 28, r.y + r.height / 2, 16, on ? 'stop' : 'play', 'focusQuick', true, live);
      return;
    }
    const rad = Math.min(r.height / 2 - 14, r.width * 0.2), cx = r.x + 18 + rad, cy = r.y + r.height / 2;
    ring(cx, cy, rad, 6);
    text(label, cx, cy + 7, 21, '#fff', 700, 'center');
    const tx = cx + rad + 22;
    text('Focus', tx, r.y + 36, 15, '#fff', 700);
    text(on ? T('Kekal fokus, Kopi memerhati', 'Stay focused, Kopi is watching') : T('Sedia untuk bermula', 'Ready to start'), tx, r.y + 54, 11, '#8f998d', 500, 'left', r.x + r.width - tx - 12);
    wbtn(tx + 18, r.y + r.height - 32, 18, on ? 'stop' : 'play', 'focusQuick', true, live);
  }
  function noteWidget(w, r) {
    if (w.size === 'S') return genericWidget(w, r);
    window.__kopiIcon?.('note', r.x + 22, r.y + 20, 16, '#ffd166');
    text('Note', r.x + 36, r.y + 25, 12, '#f2f5ef', 700);
    const lines = wrapLines(noteText, r.width - 32, 11.5, Math.max(1, Math.floor((r.height - 38) / 16)));
    if (!lines.length) { text('Tap to write something down', r.x + 16, r.y + 46, 11.5, '#6f7a6b', 500); return; }
    lines.forEach((l, i) => text(l, r.x + 16, r.y + 46 + i * 16, 11.5, '#d9dfd4', 500, 'left', r.width - 32));
  }
  function clipsWidget(w, r) {
    if (w.size === 'S') return genericWidget(w, r);
    window.__kopiIcon?.('copy', r.x + 22, r.y + 20, 16, '#5ad1c4');
    text('Clipboard', r.x + 36, r.y + 25, 12, '#f2f5ef', 700);
    if (clipList.length) text(String(clipList.length), r.x + r.width - 16, r.y + 25, 11, '#7d847f', 600, 'right');
    const max = Math.max(1, Math.floor((r.height - 36) / 17));
    if (!clipList.length) { text('Copy something and it shows up here', r.x + 16, r.y + 46, 11.5, '#6f7a6b', 500); return; }
    clipList.slice(0, max).forEach((c, i) => {
      const ly = r.y + 36 + i * 17;
      if (i) { ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(r.x + 14, ly - 2, r.width - 28, 1); }
      mono(String(c).replace(/\s+/g, ' ').trim(), r.x + 16, ly + 11, 10, '#cfd5d1', r.width - 32);
    });
  }
  function clockWidget(w, r) {
    const d = new Date(), time = d.toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit' });
    const day = d.toLocaleDateString(LOCALE(), w.size === 'S' ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long' });
    const sec = (d.getSeconds() + d.getMilliseconds() / 1000) / 60;
    if (w.size === 'L') {
      text(time, r.x + r.width / 2, r.y + r.height / 2 + 10, 44, '#fff', 700, 'center');
      text(day, r.x + r.width / 2, r.y + r.height / 2 + 34, 12.5, '#9aa596', 500, 'center');
    } else if (w.size === 'W') {
      text(time, r.x + 18, r.y + r.height / 2 + 11, 30, '#fff', 700);
      text(day, r.x + r.width - 18, r.y + r.height / 2 + 5, 12, '#9aa596', 500, 'right', r.width / 2 - 20);
    } else {
      text(time, r.x + 16, r.y + r.height / 2 + 3, 22, '#fff', 700);
      text(day, r.x + 16, r.y + r.height / 2 + 19, 10.5, '#8f998d', 500, 'left', r.width - 28);
    }
    ctx.save(); ctx.fillStyle = 'rgba(138,180,255,.6)'; ctx.fillRect(r.x + 16, r.y + r.height - 6, (r.width - 32) * sec, 2); ctx.restore();
  }
  function genericWidget(w, r) {
    const a = APPS[w.id], status = appStatus(w.id), my = r.y + r.height / 2;
    if (w.size === 'S') {
      appIcon(r.x + 12, my - 15, 30, a.icon, a.tint(), r);
      text(a.label, r.x + 52, my - 2, 12, '#f2f5ef', 700, 'left', r.width - 60);
      text(status, r.x + 52, my + 13, 10.5, '#8f998d', 500, 'left', r.width - 60);
    } else if (w.size === 'W') {
      appIcon(r.x + 14, my - 19, 38, a.icon, a.tint(), r);
      text(a.label, r.x + 64, my - 2, 14, '#f2f5ef', 700, 'left', r.width - 76);
      text(status, r.x + 64, my + 15, 11.5, '#8f998d', 500, 'left', r.width - 76);
    } else {
      appIcon(r.x + 16, r.y + 16, 46, a.icon, a.tint(), r);
      text(a.label, r.x + 18, r.y + r.height - 36, 16, '#fff', 700, 'left', r.width - 36);
      text(status, r.x + 18, r.y + r.height - 18, 11.5, '#8f998d', 500, 'left', r.width - 36);
    }
  }
  // stretch-ui.js and meter-ui.js draw their own widgets
  const RENDER = { claude: claudeWidget, focus: focusWidget, note: noteWidget, clips: clipsWidget, clock: clockWidget,
    stretch: (w, r, live) => (window.__rehattStretchWidget ? window.__rehattStretchWidget(w, r, live) : genericWidget(w, r)),
    meter: (w, r, live) => (window.__rehattMeterWidget ? window.__rehattMeterWidget(w, r, live) : genericWidget(w, r)) };
  function drawWidget(w, r, live) {
    if (w.id === 'claude' && w.size === 'L') return drawClaudeCard(r.x, r.y, r.width, r.height, live);
    widgetBg(r, live ? APPS[w.id].key : null);
    ctx.save(); ctx.beginPath(); ctx.roundRect(r.x, r.y, r.width, r.height, 16); ctx.clip();
    try { (RENDER[w.id] || genericWidget)(w, r, live); } finally { ctx.restore(); }
  }

  // ---- the grid ----
  function gridGeo(area) {
    const gap = 8, x = area.x, y = area.y, cw = (area.width - gap * (COLS - 1)) / COLS, ch = (area.height - 2 - gap * (ROWS - 1)) / ROWS;
    return { gap, x, y, cw, ch, rect: (c, r, w = 1, h = 1) => ({ x: x + c * (cw + gap), y: y + r * (ch + gap), width: w * cw + (w - 1) * gap, height: h * ch + (h - 1) * gap }) };
  }
  function dragPlan(g) { // where would everything go if you dropped it here?
    const list = getWidgets(), me = list.find(w => w.id === drag.id); if (!me) return null;
    const [sw, sh] = SIZES[me.size], left = drag.px - drag.dx, topY = drag.py - drag.dy;
    const c = Math.max(0, Math.min(COLS - sw, Math.round((left - g.x) / (g.cw + g.gap)))), r = Math.max(0, Math.min(ROWS - sh, Math.round((topY - g.y) / (g.ch + g.gap))));
    if (c === me.c && r === me.r) return null;
    const plan = arrange(list.map(w => w.id === me.id ? { ...w, c, r } : w), me.id);
    if (plan.ok) return plan;
    // no room around it: swap places with what is there
    const other = list.find(w => w.id !== me.id && w.c === c && w.r === r && w.size === me.size);
    if (other) { const swapped = arrange(list.map(w => w.id === me.id ? { ...w, c, r } : w.id === other.id ? { ...w, c: me.c, r: me.r } : w), me.id); if (swapped.ok) return swapped; }
    return null;
  }
  drawHome = function (area) {
    if (gallery) { drawGallery(area); return; }
    const g = gridGeo(area);
    cell = { w: g.cw, h: g.ch, gap: g.gap };
    const plan = drag?.moved ? dragPlan(g) : null;
    if (drag) drag.plan = plan;
    const { placed, used } = plan || arrange(getWidgets());
    homeGeo = { area, g };
    placed.forEach((w, i) => {
      if (w.hidden) return;
      const target = g.rect(w.c, w.r, w.cw, w.ch);
      if (drag?.moved && drag.id === w.id) { anim[w.id] = { ...target }; return; } // drawn on top, below
      const r = smooth(w.id, target);
      withWiggle(r, i + 1, () => { drawWidget(w, r, !homeEdit); if (homeEdit) { badge(r.x + 6, r.y + 6, '-'); badge(r.x + r.width - 6, r.y + r.height - 6, 'size'); } });
      hit['hmW_' + w.id] = target;
      if (homeEdit) { hit['hmMinus_' + w.id] = { x: r.x - 6, y: r.y - 6, width: 24, height: 24 }; hit['hmSize_' + w.id] = { x: r.x + r.width - 18, y: r.y + r.height - 18, width: 24, height: 24 }; }
    });
    // empty spots: a + to add a widget there
    if (!drag?.moved) for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (used[r][c]) continue;
      const b = g.rect(c, r);
      ctx.save(); ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.roundRect(b.x + 0.5, b.y + 0.5, b.width - 1, b.height - 1, 15.5); ctx.strokeStyle = homeEdit ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.07)'; ctx.stroke(); ctx.restore();
      if (homeEdit) badge(b.x + b.width / 2, b.y + b.height / 2, '+');
      else window.__kopiIcon?.('plus', b.x + b.width / 2, b.y + b.height / 2, 18, inside(pointer.x, pointer.y, b) ? '#c6e994' : '#4a504c');
      hit[`hmAdd_${c}_${r}`] = b;
    }
    // the widget you are dragging follows the mouse, a bit bigger
    if (drag?.moved) {
      const w = getWidgets().find(x => x.id === drag.id);
      if (w) {
        const [sw, sh] = SIZES[w.size], rw = sw * g.cw + (sw - 1) * g.gap, rh = sh * g.ch + (sh - 1) * g.gap, r = { x: drag.px - drag.dx, y: drag.py - drag.dy, width: rw, height: rh };
        ctx.save(); ctx.translate(r.x + rw / 2, r.y + rh / 2); ctx.scale(1.05, 1.05); ctx.translate(-(r.x + rw / 2), -(r.y + rh / 2));
        ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8; ctx.fillStyle = '#141517'; ctx.beginPath(); ctx.roundRect(r.x, r.y, rw, rh, 16); ctx.fill(); ctx.shadowColor = 'transparent';
        drawWidget(w, r, false); ctx.restore();
      }
    }
    delete hit.todayApp; delete hit.assistantApp; delete hit.projectApp;
  };

  // ---- the + menu: a widget gallery with a live preview, sizes and ready-made layouts ----
  function openGallery(c, r) {
    homeEdit = true; drag = null;
    const on = getWidgets().map(w => w.id), pick = Object.keys(APPS).find(id => !on.includes(id)) || 'claude';
    gallery = { pick, size: getWidgets().find(w => w.id === pick)?.size || 'S', c, r };
    refreshWidgetData(); sound('click'); setMode('expanded', false);
  }
  function setGallery(v) { const was = Boolean(gallery); gallery = v; if (was !== Boolean(v) && mode === 'expanded') setMode('expanded', false); }
  function galleryResult() { // what would happen if you press the button
    const list = getWidgets(), mine = list.find(w => w.id === gallery.pick);
    if (mine && mine.size === gallery.size) return { label: T('Sudah ada', 'Already there'), ok: false };
    const item = { id: gallery.pick, size: gallery.size, c: mine ? mine.c : gallery.c, r: mine ? mine.r : gallery.r };
    const rest = list.filter(w => w.id !== gallery.pick);
    let plan = arrange([...rest, item], item.id);
    if (!plan.ok) plan = arrange([...rest, { ...item, c: undefined, r: undefined }]);
    if (!plan.ok) return { label: T('Tiada ruang', 'No room'), ok: false, hint: T('Buang sesuatu dahulu atau kecilkan sesuatu', 'Remove something first or make something smaller') };
    return { label: mine ? T(`Jadikan ${({ S: 'kecil', W: 'lebar', L: 'besar' })[gallery.size]}`, `Make ${SIZE_NAME[gallery.size].toLowerCase()}`) : T('Tambah', 'Add'), ok: true, plan };
  }
  function chip(x, y, w, h, label, on, key) {
    const b = { x, y, width: w, height: h }, over = inside(pointer.x, pointer.y, b);
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fillStyle = on ? '#c6e994' : over ? '#24272a' : '#1a1c1e'; ctx.fill(); ctx.restore();
    text(label, x + w / 2, y + h / 2 + 4, 11.5, on ? '#10180c' : '#e8ece6', 700, 'center');
    hit[key] = b;
  }
  function drawGallery(area) {
    const x = area.x, y = area.y, W = area.width;
    text('Widgets', x + 4, y + 20, 16, '#fff', 700);
    text('Pick an app and a size, or a ready-made layout', x + 78, y + 20, 11, '#8f998d', 500, 'left', W - 200);
    chip(x + W - 74, y + 4, 74, 26, 'Done', true, 'hmGalClose');
    // ready-made layouts, each with a tiny picture of the grid
    const py = y + 32, pw = (W - 4 * 8) / 5, ph = 40;
    PRESETS.forEach((p, i) => {
      const bx = x + i * (pw + 8), b = { x: bx, y: py, width: pw, height: ph }, over = inside(pointer.x, pointer.y, b);
      ctx.save(); ctx.beginPath(); ctx.roundRect(bx, py, pw, ph, 12); ctx.fillStyle = over ? '#202326' : '#16181a'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.stroke(); ctx.restore();
      const tw = 40, th = 22, tx = bx + 10, ty = py + (ph - th) / 2, tg = 2, tcw = (tw - tg * 3) / 4, tch = (th - tg) / 2;
      presetLayout(p).placed.forEach(w => { if (w.hidden) return; ctx.save(); ctx.beginPath(); ctx.roundRect(tx + w.c * (tcw + tg), ty + w.r * (tch + tg), w.cw * tcw + (w.cw - 1) * tg, w.ch * tch + (w.ch - 1) * tg, 3); ctx.fillStyle = APPS[w.id].tint(); ctx.globalAlpha = 0.75; ctx.fill(); ctx.restore(); });
      text(p.name, tx + tw + 10, py + ph / 2 + 4, 11.5, '#e8ece6', 700, 'left', pw - tw - 26);
      hit['hmPreset_' + i] = b;
    });
    // left: all apps
    const by = py + ph + 10, colW = 122, rowH = 29, onHome = getWidgets().map(w => w.id);
    Object.keys(APPS).filter(id => installed(id)).forEach((id, i) => {
      const a = APPS[id], bx = x + (i % 2) * (colW + 6), byy = by + Math.floor(i / 2) * (rowH + 5), b = { x: bx, y: byy, width: colW, height: rowH }, sel = gallery.pick === id, over = inside(pointer.x, pointer.y, b);
      ctx.save(); ctx.beginPath(); ctx.roundRect(bx, byy, colW, rowH, 10); ctx.fillStyle = sel ? 'rgba(198,233,148,.14)' : over ? '#202326' : '#16181a'; ctx.fill(); if (sel) { ctx.strokeStyle = 'rgba(198,233,148,.6)'; ctx.stroke(); } ctx.restore();
      appIcon(bx + 5, byy + 4, 21, a.icon, a.tint(), b);
      text(a.label, bx + 33, byy + 19, 11.5, '#eef2ec', 600, 'left', colW - 52);
      if (onHome.includes(id)) { ctx.save(); ctx.beginPath(); ctx.arc(bx + colW - 12, byy + rowH / 2, 5, 0, Math.PI * 2); ctx.fillStyle = '#c6e994'; ctx.fill(); ctx.restore(); }
      hit['hmGalApp_' + id] = b;
    });
    // right: sizes + live preview + button
    const rx = x + colW * 2 + 26, rw = x + W - rx, sy = by;
    ['S', 'W', 'L'].forEach((s, i) => chip(rx + i * 80, sy, 72, 26, SIZE_NAME[s], gallery.size === s, 'hmGalSize_' + s));
    const res = galleryResult();
    const bw = 130, bb = { x: x + W - bw, y: sy, width: bw, height: 26 };
    ctx.save(); ctx.beginPath(); ctx.roundRect(bb.x, bb.y, bw, 26, 13); ctx.fillStyle = res.ok ? (inside(pointer.x, pointer.y, bb) ? '#d9f7b3' : '#c6e994') : '#2a2d30'; ctx.fill(); ctx.restore();
    text(res.label, bb.x + bw / 2, bb.y + 17, 11.5, res.ok ? '#10180c' : '#8f998d', 700, 'center');
    hit.hmGalAdd = bb;
    const [sw, sh] = SIZES[gallery.size], pwid = sw * cell.w + (sw - 1) * cell.gap, phei = sh * cell.h + (sh - 1) * cell.gap;
    const availH = area.y + area.height - (sy + 38) - (res.hint ? 16 : 2), scale = Math.min(1, rw / pwid, availH / phei);
    const prx = rx + (rw - pwid * scale) / 2, pry = sy + 36 + (availH - phei * scale) / 2;
    ctx.save(); ctx.translate(prx, pry); ctx.scale(scale, scale);
    drawWidget({ id: gallery.pick, size: gallery.size }, { x: 0, y: 0, width: pwid, height: phei }, false);
    ctx.restore();
    if (res.hint) text(res.hint, rx + rw / 2, area.y + area.height - 4, 10.5, '#ffb35c', 600, 'center');
  }

  // ---- mouse: hold a widget (iPhone) → edit mode; drag to move ----
  const onHome = () => currentView === 'home' && mode === 'expanded';
  canvas.addEventListener('pointerdown', e => {
    swallowClick = false;
    if (!onHome() || gallery || !homeGeo) return;
    if (homeEdit && getWidgets().some(w => inside(e.clientX, e.clientY, hit['hmMinus_' + w.id]) || inside(e.clientX, e.clientY, hit['hmSize_' + w.id]))) return;
    if (Object.keys(hit).some(k => /^(focusQuick|stretchQuick|meterQuick)$/.test(k) && inside(e.clientX, e.clientY, hit[k]))) return;
    const w = getWidgets().find(x => inside(e.clientX, e.clientY, hit['hmW_' + x.id]));
    if (!w) return;
    const r = homeGeo.g.rect(w.c, w.r);
    drag = { id: w.id, x0: e.clientX, y0: e.clientY, px: e.clientX, py: e.clientY, dx: e.clientX - r.x, dy: e.clientY - r.y, moved: false };
    if (!homeEdit) { clearTimeout(longPress); longPress = setTimeout(() => { if (drag && !drag.moved) { window.__kopiHomeEdit(true); drag = { ...drag }; swallowClick = true; } }, 500); }
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    drag.px = e.clientX; drag.py = e.clientY;
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) { if (homeEdit) drag.moved = true; else { clearTimeout(longPress); drag = null; } }
  });
  canvas.addEventListener('pointerup', () => {
    clearTimeout(longPress);
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved) return;
    swallowClick = true;
    if (d.plan) { saveWidgets(d.plan.placed); sound('click'); }
  });
  canvas.addEventListener('click', e => {
    if (!onHome()) return;
    const at = b => inside(e.clientX, e.clientY, b), stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (swallowClick) { swallowClick = false; stop(); return; }
    if (e.clientY < 36) return; // the header has its own buttons
    if (gallery) {
      stop();
      if (at(hit.hmGalClose)) { setGallery(null); sound('click'); return; }
      for (let i = 0; i < PRESETS.length; i++) if (at(hit['hmPreset_' + i])) { saveWidgets(presetLayout(PRESETS[i]).placed); setGallery(null); window.__kopiKick?.(0.04); sound('click'); return; }
      for (const id of Object.keys(APPS)) if (at(hit['hmGalApp_' + id])) { gallery.pick = id; gallery.size = getWidgets().find(w => w.id === id)?.size || gallery.size; sound('click'); return; }
      for (const s of Object.keys(SIZES)) if (at(hit['hmGalSize_' + s])) { gallery.size = s; sound('click'); return; }
      if (at(hit.hmGalAdd)) { const res = galleryResult(); if (res.ok) { saveWidgets(res.plan.placed); setGallery(null); window.__kopiKick?.(0.03); sound('click'); } else window.__kopiFlash?.(res.hint || res.label, 1200); }
      return;
    }
    for (const k of Object.keys(hit)) if (k.startsWith('hmAdd_') && at(hit[k])) { stop(); const [, c, r] = k.split('_'); openGallery(+c, +r); return; }
    if (!homeEdit) return;
    stop(); // in edit mode a tap never opens apps
    for (const w of getWidgets()) {
      if (at(hit['hmMinus_' + w.id])) { saveWidgets(getWidgets().filter(x => x.id !== w.id)); sound('click'); return; }
      if (at(hit['hmSize_' + w.id])) {
        const order = ['S', 'W', 'L'], list = getWidgets();
        for (let k = 1; k < 3; k++) {
          const size = order[(order.indexOf(w.size) + k) % 3], plan = arrange(list.map(x => x.id === w.id ? { ...x, size, c: Math.min(x.c, COLS - SIZES[size][0]), r: Math.min(x.r, ROWS - SIZES[size][1]) } : x), w.id);
          if (plan.ok) { saveWidgets(plan.placed); window.__kopiFlash?.(SIZE_NAME[size], 700); sound('click'); return; }
        }
        window.__kopiFlash?.('No room to make it bigger', 1200); return;
      }
    }
  }, true);

  // Quick buttons on the home widgets (start focus, start a stretch) — before the card's own click.
  canvas.addEventListener('click', event => {
    if (currentView !== 'home' || mode !== 'expanded') return;
    const stop = () => { event.preventDefault(); event.stopImmediatePropagation(); };
    if (inside(event.clientX, event.clientY, hit.focusQuick)) { stop(); window.__kopiFocus?.toggle(); }
    else if (inside(event.clientX, event.clientY, hit.stretchQuick)) { stop(); window.__rehattStretch?.startNow(); }
  }, true);

  // ---- Apps (the + button): a grid of app tiles, each with a live status line ----
  const TILE_TINT = { stretch: '#ff8fb1', glass: '#e0a96d', terminal: '#c6e994', timer: '#ffb35c', tray: '#8ab4ff', gear: '#b9c2b4' };
  function tile(x, y, w, h, iconName, name, status, key, tint) {
    const over = card(x, y, w, h, key, tint);
    const iy = y + (h - 40) / 2;
    appIcon(x + 14, iy, 40, iconName, tint, { x, y, width: w, height: h });
    text(name, x + 66, y + h / 2 - 2, 13, '#fff', 700, 'left', w - 92);
    text(status, x + 66, y + h / 2 + 15, 10.5, '#8f998d', 500, 'left', w - 80);
    if (over) text('›', x + w - 18, y + h / 2 + 6, 18, 'rgba(255,255,255,.55)', 400, 'center');
  }
  drawApps = function (area) {
    const PAGE = window.__kopiPage, focus = window.__kopiFocus, p = top();
    PAGE.title(area, 'Apps', 'Everything Rehatt can do · Ctrl+Alt+1–6 = shortcut');
    const cols = 4, x = area.x + PAGE.contentX, gap = 10, w = Math.floor((area.width - PAGE.contentX * 2 - gap * (cols - 1)) / cols);
    const y = area.y + PAGE.bodyY, h = Math.min(84, Math.floor((area.height - PAGE.bodyY - gap - 4) / 2));
    const tray = window.__kopiTrayCount?.() || 0;
    const tiles = [
      ['stretch', 'Stretch', appStatus('stretch'), 'stretchApp', TILE_TINT.stretch],
      ['glass', 'Usage', appStatus('meter'), 'meterApp', TILE_TINT.glass],
      ['terminal', 'AI', p ? p.name + ' · ' + (p.detail || labels[p.state]) : 'Claude Code, Codex', 'monitor_claudecode', p ? colourOf(p.state) : TILE_TINT.terminal],
      ['timer', 'Focus', focus?.active() ? T(`${focus.label()} lagi`, `${focus.label()} left`) : `${focus?.minutes?.() || 25} min`, 'focusApp', TILE_TINT.timer],
      ['tray', 'Tray', tray ? T(`${tray} fail`, `${tray} file${tray === 1 ? '' : 's'}`) : 'Empty', 'trayApp', TILE_TINT.tray],
      ['copy', 'Clipboard', 'Your last copies', 'clipsApp', '#5ad1c4'],
      ['note', 'Note', 'Jot something down', 'noteApp', '#ffd166']
    ];
    // apps you removed in Rehatt Settings → Apps are not here
    const off = window.__kopiAppsOff?.() || new Set(), shown = tiles.filter(t => !off.has(APP_OF_KEY[t[3]]));
    for (const t of tiles) if (!shown.includes(t)) delete hit[t[3]];
    shown.forEach(([icon, name, status, key, tint], i) => tile(x + (i % cols) * (w + gap), y + Math.floor(i / cols) * (h + gap), w, h, icon, name, status, key, tint));
    // next free spot: the Kopi tip
    const tipAt = Math.min(shown.length, cols * 2 - 1), tx = x + (tipAt % cols) * (w + gap), ty = y + Math.floor(tipAt / cols) * (h + gap);
    ctx.save(); ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.roundRect(tx + 0.5, ty + 0.5, w - 1, h - 1, 15.5); ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.stroke(); ctx.restore();
    text('TIP', tx + 16, ty + h / 2 - 16, 9.5, '#c6e994', 700);
    text('Ctrl + Alt + T', tx + 16, ty + h / 2 + 2, 13, '#fff', 700, 'left', w - 32);
    text('opens Rehatt anywhere', tx + 16, ty + h / 2 + 18, 10.5, '#8f998d', 500, 'left', w - 32);
    delete hit.todayApp; delete hit.assistantApp; delete hit.projectApp;
  };
  // ---- Your shortcuts (the + button): you choose which apps are here (max 4). The same apps are on the home card. ----
  const APPS = {
    stretch: { icon: 'stretch', label: 'Stretch', key: 'stretchApp', tint: () => '#ff8fb1' },
    meter: { icon: 'glass', label: 'Usage', key: 'meterApp', tint: () => '#e0a96d' },
    claude: { icon: 'terminal', label: 'AI', key: 'monitor_claudecode', tint: () => '#c6e994' },
    focus: { icon: 'timer', label: 'Focus', key: 'focusApp', tint: () => '#ffb35c' },
    tray: { icon: 'tray', label: 'Tray', key: 'trayApp', tint: () => '#7ab8ff' },
    clips: { icon: 'copy', label: 'Clipboard', key: 'clipsApp', tint: () => '#5ad1c4' },
    note: { icon: 'note', label: 'Note', key: 'noteApp', tint: () => '#ffd166' },
    settings: { icon: 'gear', label: 'Settings', key: 'settingsApp', tint: () => '#b98cff' },
    clock: { icon: 'clock', label: 'Clock', key: 'clockApp', tint: () => '#8ab4ff' }
  };
  const APP_OF_KEY = Object.fromEntries(Object.entries(APPS).map(([id, a]) => [a.key, id]));
  const MAX_SHORTCUTS = 4, DEFAULT_SHORTCUTS = ['stretch', 'meter', 'focus', 'settings'];
  const installed = id => !(window.__kopiAppsOff?.() || new Set()).has(id);
  const shortcuts = () => { try { const v = JSON.parse(localStorage.getItem('kopi:shortcuts')); if (Array.isArray(v) && v.length) return v.filter(id => APPS[id] && installed(id)).slice(0, MAX_SHORTCUTS); } catch {} return DEFAULT_SHORTCUTS.filter(installed); };
  const saveShortcuts = list => { try { localStorage.setItem('kopi:shortcuts', JSON.stringify(list)); } catch {} };
  window.__kopiShortcuts = shortcuts;
  let editShortcuts = false;
  function appStatus(id) {
    const focus = window.__kopiFocus, p = top(), tray = window.__kopiTrayCount?.() || 0;
    if (id === 'stretch') return window.__rehattStretch?.status() || T('Rehat regangan', 'Stretch breaks');
    if (id === 'meter') return window.__rehattMeter?.status() || T('Penggunaan Claude', 'Claude usage');
    if (id === 'claude') return p ? p.detail || labels[p.state] : 'Idle';
    if (id === 'focus') return focus?.active() ? T(`${focus.label()} lagi`, `${focus.label()} left`) : `${focus?.minutes?.() || 25} min`;
    if (id === 'tray') return tray ? T(`${tray} fail`, `${tray} file${tray === 1 ? '' : 's'}`) : 'Empty';
    if (id === 'clips') return 'Last copies';
    if (id === 'note') return 'Write it down';
    if (id === 'clock') return new Date().toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit' });
    return 'Colours, sound';
  }
  function drawShortcuts(area) {
    const PAGE = window.__kopiPage, list = shortcuts();
    PAGE.title(area, T('Pintasan', 'Shortcuts'), editShortcuts ? T(`Pilih sehingga ${MAX_SHORTCUTS} aplikasi · ia juga muncul di skrin utama`, `Choose up to ${MAX_SHORTCUTS} apps · they also show on your home screen`) : T('Aplikasi kegemaran anda', 'Your favourite apps'));
    // edit / done button (top right)
    const bw = 104, bx = area.x + area.width - PAGE.contentX - bw, by = area.y + 10, overB = inside(pointer.x, pointer.y, { x: bx, y: by, width: bw, height: 32 });
    ctx.save(); ctx.beginPath(); ctx.roundRect(bx, by, bw, 32, 16); ctx.fillStyle = editShortcuts ? (overB ? '#d9f7b3' : '#c6e994') : (overB ? '#24272a' : '#1a1c1e'); ctx.fill(); ctx.restore();
    text(editShortcuts ? T('Siap', 'Done') : T('Ubah', 'Edit'), bx + bw / 2, by + 21, 12, editShortcuts ? '#10180c' : '#e8ece6', 700, 'center');
    hit.scEdit = { x: bx, y: by, width: bw, height: 32 };
    const x = area.x + PAGE.contentX, w = area.width - PAGE.contentX * 2, y = area.y + PAGE.bodyY;
    if (!editShortcuts) {
      const gap = 10, tw = Math.floor((w - gap * (MAX_SHORTCUTS - 1)) / MAX_SHORTCUTS), th = 92;
      list.forEach((id, i) => { const a = APPS[id]; tile(x + i * (tw + gap), y, tw, th, a.icon, a.label, appStatus(id), a.key, a.tint()); });
      for (let i = list.length; i < MAX_SHORTCUTS; i++) { // empty spot
        const tx = x + i * (tw + gap); ctx.save(); ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.roundRect(tx + 0.5, y + 0.5, tw - 1, th - 1, 15.5); ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.stroke(); ctx.restore();
        text(T('+ Ruang kosong', '+ Empty slot'), tx + tw / 2, y + th / 2 + 4, 11.5, '#6f7a6b', 600, 'center');
      }
      text(T('Tip: Ctrl + Alt + 1–6 juga membuka aplikasi dengan papan kekunci', 'Tip: Ctrl + Alt + 1–6 also opens apps from the keyboard'), x, y + th + 28, 11, '#6f7a6b', 500);
      return;
    }
    // edit mode: every app as a toggle; chosen ones are lit and numbered
    const cols = 4, gap = 10, cw = Math.floor((w - gap * (cols - 1)) / cols), ch = 52;
    Object.entries(APPS).filter(([id]) => installed(id)).forEach(([id, a], i) => {
      const cx = x + (i % cols) * (cw + gap), cy = y + Math.floor(i / cols) * (ch + gap), on = list.indexOf(id), bounds = { x: cx, y: cy, width: cw, height: ch }, over = inside(pointer.x, pointer.y, bounds);
      ctx.save(); ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 14); ctx.fillStyle = on >= 0 ? 'rgba(198,233,148,.12)' : over ? '#1d2021' : '#141617'; ctx.fill();
      ctx.strokeStyle = on >= 0 ? 'rgba(198,233,148,.55)' : 'rgba(255,255,255,.07)'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
      appIcon(cx + 10, cy + 13, 26, a.icon, a.tint(), bounds);
      text(a.label, cx + 46, cy + 31, 12, '#eef2ec', 600, 'left', cw - 82);
      // check badge
      ctx.save(); ctx.beginPath(); ctx.arc(cx + cw - 18, cy + ch / 2, 9, 0, Math.PI * 2);
      if (on >= 0) { ctx.fillStyle = '#c6e994'; ctx.fill(); ctx.restore(); text(String(on + 1), cx + cw - 18, cy + ch / 2 + 4, 10.5, '#10180c', 800, 'center'); }
      else { ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore(); }
      hit['scToggle_' + id] = bounds;
    });
    text(list.length >= MAX_SHORTCUTS ? T(`Penuh (${MAX_SHORTCUTS}/${MAX_SHORTCUTS}) · klik satu untuk ditukar`, `Full (${MAX_SHORTCUTS}/${MAX_SHORTCUTS}) · click one to swap it`) : T(`${list.length}/${MAX_SHORTCUTS} dipilih`, `${list.length}/${MAX_SHORTCUTS} chosen`), x, y + 2 * (ch + gap) + 18, 11, '#7f8a7a', 600);
  }
  canvas.addEventListener('click', event => {
    if (currentView !== 'shortcuts' || mode !== 'expanded') return;
    const stop = () => { event.preventDefault(); event.stopImmediatePropagation(); };
    if (inside(event.clientX, event.clientY, hit.scEdit)) { stop(); editShortcuts = !editShortcuts; sound('click'); return; }
    if (!editShortcuts) return;
    for (const id of Object.keys(APPS)) {
      if (!inside(event.clientX, event.clientY, hit['scToggle_' + id])) continue;
      stop(); let list = shortcuts();
      if (list.includes(id)) list = list.filter(x => x !== id);
      else if (list.length < MAX_SHORTCUTS) list.push(id);
      else { window.__kopiFlash?.('Max 4 · remove one first', 1200); return; }
      saveShortcuts(list); sound('click'); return;
    }
  }, true);

  // ---- Usage ring: fills with how much of your 5-hour Claude limit you used ----
  const usage = () => window.__rehattMeter?.usage() || providers().find(p => p.provider === 'claudecode')?.usage || {};
  const ringColour = used => used >= 85 ? '#ff3b3b' : used >= 60 ? '#ff9a1f' : '#22e05a';
  function drawUsageRing(x, y, r) {
    const w = usage().fiveHour; if (!w) return;
    const used = w.used / 100, start = -Math.PI / 2;
    ctx.save(); ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.stroke();
    if (used > 0) {
      ctx.beginPath(); ctx.arc(x, y, r, start, start + Math.PI * 2 * Math.min(1, used));
      ctx.strokeStyle = ringColour(w.used); ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 8; ctx.stroke();
    }
    ctx.restore();
    text(w.used + '%', x - 10, y + r + 16, 10, '#d9e2d3', 600);
  }
  canvas.addEventListener('click', event => {
    // A tap on Kopi himself is for Kopi (he hops, gets angry, gets dizzy), not for the card he stands on.
    if (mode === 'expanded' && inside(event.clientX, event.clientY, hit.ghost)) return;
    // one of the little bots on the AI card: open that chat
    for (const [key, box] of Object.entries(hit)) {
      if (key.startsWith('aichip_') && inside(event.clientX, event.clientY, box)) { event.preventDefault(); event.stopImmediatePropagation(); open(box.provider, true); return; }
    }
    for (const provider of Object.keys(names)) {
      if (inside(event.clientX, event.clientY, hit['monitor_' + provider])) { event.preventDefault(); event.stopImmediatePropagation(); open(provider); return; }
    }
    // Click the small or medium island while the eyes show a colour: open that status.
    if (active() && mode !== 'expanded' && inside(event.clientX, event.clientY, islandBounds)) {
      event.preventDefault(); event.stopImmediatePropagation();
      const p = top();
      // Claude is done or wants you: go straight to the Claude Code window (the page only if that fails).
      if (p?.kind === 'hooks' && p.canJump && ['done', 'error'].includes(p.state)) { // a question opens the page, so you can read it
        api.aiMonitorHooksJump(p.sessionId).then(result => {
          if (!result?.ok) return open(p.provider);
          if (p.state !== 'question') api.aiMonitorHooksSeen?.().then(update).catch(() => {});
          sound('click');
        }).catch(() => open(p.provider));
        return;
      }
      open(p?.provider);
    }
  }, true);
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && currentView === 'monitor') { event.preventDefault(); event.stopImmediatePropagation(); small(); }
  }, true);
  api.onAiMonitorState(update); api.onAiMonitorOpen(({ provider }) => open(provider));
  api.aiMonitorGet().then(update).catch(failure => { error = failure.message; render(); });
  function position() {
    const show = currentView === 'monitor' && mode === 'expanded' && visual.width > 600 && visual.height > 245;
    const display = show ? 'block' : 'none'; if (root.style.display !== display) root.style.display = display;
    if (show) {
      const p = current(), stage = Boolean(p?.kind === 'hooks' && p.connected && window.__kopiPlaceOnStage);
      root.classList.toggle('cc-stage', stage); root.classList.toggle('cc-codex', stage && p.agent === 'codex'); // Codex: blue
      if (stage) window.__kopiPlaceOnStage(root, contentRect()); else window.__kopiPage.place(root, contentRect());
    }
    requestAnimationFrame(position);
  }
  window.__kopiMonitor = Object.freeze({ open, small, state: () => state, refresh: () => { lastSignature = ''; update(state); } }); render(); requestAnimationFrame(position);
})();
