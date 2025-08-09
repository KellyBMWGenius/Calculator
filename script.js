// --- Constants (Ohio rules) ---
const TERM_LEASE = 36;
const ACQ_FEE = 925;
const DOC_FEE = 387;
const MF_MARKUP = 0.0004;
const PLATE_FEE = 75;

// --- Helpers: parse / format ---
const moneyRe = /[^0-9.\-]/g;
const percentRe = /[^0-9.\-]/g;

function parseMoney(s){ s = (s||"").trim(); if(!s) return 0; return parseFloat(s.replace(moneyRe,""))||0; }
function parsePercent(s){ s = (s||"").trim(); if(!s) return 0; return parseFloat(s.replace(percentRe,""))||0; }
function parseIntOnly(s){ s = (s||"").trim(); const n = parseInt(s.replace(/[^0-9]/g,""),10); return isNaN(n)?0:n; }

function fmtMoney(x){ return x.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2}); }
function fmtMoneyCompact(x){
  // display like $1,234 (no cents) unless there are cents
  const isInt = Math.abs(x - Math.round(x)) < 1e-9;
  return isInt ? `$${Math.round(x).toLocaleString()}` : fmtMoney(x);
}
function fmtPercentDisp(x){
  const isInt = Math.abs(x - Math.round(x)) < 1e-9;
  return isInt ? `${Math.round(x)}%` : `${x.toFixed(2)}%`;
}

// --- Input formatting on blur (currency/percent) ---
function setupFormatters(){
  const $ = (id)=>document.getElementById(id);
  const moneyIds = ["msrp","discount","rebatesLease","downLease","rebatesFin","downFin","tradeIn"];
  moneyIds.forEach(id=>{
    $(id).addEventListener("blur", ()=>{
      const val = parseMoney($(id).value);
      $(id).value = val ? fmtMoneyCompact(val) : "";
    });
  });

  const pctIds = ["taxPct","residualPct","ratePct"];
  pctIds.forEach(id=>{
    $(id).addEventListener("blur", ()=>{
      const val = parsePercent($(id).value);
      $(id).value = val ? fmtPercentDisp(val) : "";
    });
  });

  $("termMonths").addEventListener("blur", ()=>{
    const n = parseIntOnly($("termMonths").value);
    $("termMonths").value = n ? `${n} months` : "";
  });
}

// --- Theme toggle ---
function setupTheme(){
  const btn = document.getElementById("themeToggle");
  const body = document.body;
  btn.addEventListener("click", ()=>{
    const dark = body.classList.toggle("dark");
    btn.textContent = dark ? "Light" : "Dark";
  });
}

// --- Lease math (Excel-match with capitalized tax flow) ---
function calcLease(){
  const $ = (id)=>document.getElementById(id);

  const msrp = parseMoney($("msrp").value);
  const discount = parseMoney($("discount").value);
  const taxPct = parsePercent($("taxPct").value)/100;

  const residualPct = parsePercent($("residualPct").value)/100;
  const mfInput = parseFloat(($("moneyFactor").value||"").replace(percentRe,"")) || 0;
  const rebates = parseMoney($("rebatesLease").value);
  const down = parseMoney($("downLease").value);

  if(msrp<=0 || residualPct<=0 || residualPct>=1){ alert("Please check MSRP and Residual %."); return; }
  if(mfInput<0 || mfInput>0.02){ alert("Money Factor looks off (e.g., 0.00188)."); return; }

  const mfUsed = mfInput + MF_MARKUP;
  const sellingPrice = msrp - discount;

  // Excel analogs
  const capReduction = rebates + down;                     // B13 in spirit
  const C17 = sellingPrice + ACQ_FEE + DOC_FEE - capReduction;
  const C18 = msrp * residualPct;
  const C19 = (C17 + C18) * mfUsed;
  const C20 = (C17 - C18) / TERM_LEASE;
  const C21 = C19 + C20;                                   // pre-tax (not displayed)

  const C23 = C21 * taxPct;
  const C24 = C23 * TERM_LEASE;
  const C26 = C17 + C24;

  const E19 = (C26 + C18) * mfUsed;
  const E20 = (C26 - C18) / TERM_LEASE;
  const E21 = E19 + E20;                                   // monthly with tax

  const taxOnDown = down * taxPct;
  const das = E21 + down + taxOnDown + PLATE_FEE;

  $("leaseResidualOut").textContent = fmtMoney(C18);
  $("leasePaymentOut").textContent = fmtMoney(E21);
  $("leaseDasOut").textContent = fmtMoney(das);
}

// --- Finance math (taxes rolled; sign-and-drive) ---
function calcFinance(){
  const $ = (id)=>document.getElementById(id);

  const msrp = parseMoney($("msrp").value);
  const discount = parseMoney($("discount").value);
  const taxPct = parsePercent($("taxPct").value)/100;

  const termMonths = parseIntOnly($("termMonths").value);
  const ratePct = parsePercent($("ratePct").value)/100;
  const rebates = parseMoney($("rebatesFin").value);
  const down = parseMoney($("downFin").value);
  const tradeIn = parseMoney($("tradeIn").value);

  if(msrp<=0 || termMonths<=0){ alert("Please check MSRP and Term."); return; }
  if(ratePct < 0){ alert("Rate % cannot be negative."); return; }

  // Selling price (no acq fee), doc fee added
  const sellingPrice = msrp - discount + DOC_FEE;

  // OH tax: trade-in reduces taxable base; down & rebates are taxable
  const taxableBase = (sellingPrice - tradeIn) + down + rebates;
  const totalTax = taxableBase * taxPct;

  // Capitalize all taxes into the loan
  const principal = (sellingPrice - tradeIn - down - rebates) + totalTax;
  if(principal < 0){ alert("Computed loan amount is negative. Reduce cash/trade/rebates."); return; }

  // Payment
  let payment;
  if(ratePct > 0){
    const r = ratePct/12;
    const pow = Math.pow(1+r, termMonths);
    payment = principal * (r * pow) / (pow - 1);
  }else{
    payment = principal / termMonths;
  }

  // DAS: first payment + plate + money down
  const das = payment + PLATE_FEE + down;

  $("loanAmountOut").textContent = fmtMoney(principal);
  $("finPaymentOut").textContent = fmtMoney(payment);
  $("finDasOut").textContent = fmtMoney(das);
}

// --- Wire up ---
window.addEventListener("DOMContentLoaded", ()=>{
  setupFormatters();
  setupTheme();
  document.getElementById("calcLease").addEventListener("click", calcLease);
  document.getElementById("calcFin").addEventListener("click", calcFinance);
});
