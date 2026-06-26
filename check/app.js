let currentUserData = null;
let historyBankData = null; // 儲存歷史記憶帳戶
let isSubmitting = false;
let tempIdToken = null;
let tempRef = '';

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await liff.init({ liffId: FRONTEND_CONFIG.LIFF_ID });
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }
    
    // 🔒 1. 官方 LINE 好友攔截安全鎖
    const friendship = await liff.getFriendship();
    if (!friendship.friendFlag) {
      alert('您必須先加入「動元力國際」官方 LINE 帳號好友，才能開通與使用簽到系統喔！');
      window.location.href = "https://line.me/R/ti/p/@YOUR_LINE_BOT_ID"; // 💡 請換成動元力官方加好友連結
      return;
    }

    tempIdToken = liff.getIDToken();
    const urlParams = new URLSearchParams(window.location.search);
    tempRef = urlParams.get('ref') || '';

    const response = await fetch(FRONTEND_CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'bindLine', idToken: tempIdToken, refMemberId: tempRef })
    });
    const result = await response.json();

    if (result.success) {
      document.getElementById('loading-page').style.display = 'none';
      if (result.needRegister) {
        document.getElementById('register-page').style.display = 'block';
        setupRegisterEvents();
      } else {
        currentUserData = result.member;
        historyBankData = result.historyBank; // 👑 儲存來自後端的帳戶歷史記憶
        renderPageData(currentUserData);
        document.getElementById('main-page').style.display = 'block';
      }
    } else {
      alert('動元力系統驗證失敗：' + result.message);
    }
  } catch (error) {
    console.error(error);
    alert('系統初始化發生錯誤，請重新開啟。');
  }
});

function setupRegisterEvents() {
  document.getElementById('btn-submit-reg').addEventListener('click', async () => {
    const nameInput = document.getElementById('reg-name').value.trim();
    const phoneInput = document.getElementById('reg-phone').value.trim();
    
    if (!nameInput) return alert('請輸入您的真實姓名');
    if (!/^09\d{8}$/.test(phoneInput)) return alert('請填寫正確的手機號碼格式(10碼)');

    document.getElementById('btn-submit-reg').disabled = true;
    document.getElementById('btn-submit-reg').innerText = '開通處理中...';

    try {
      const response = await fetch(FRONTEND_CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'registerMember', idToken: tempIdToken, phone: phoneInput, realName: nameInput, refMemberId: tempRef })
      });
      const result = await response.json();

      if (result.success) {
        alert('🎉 帳號開通與綁定成功！');
        currentUserData = result.member;
        historyBankData = null;
        renderPageData(currentUserData);
        document.getElementById('register-page').style.display = 'none';
        document.getElementById('main-page').style.display = 'block';
      } else {
        alert('開通失敗：' + result.message);
        document.getElementById('btn-submit-reg').disabled = false;
        document.getElementById('btn-submit-reg').innerText = '確認開通帳號';
      }
    } catch (e) {
      alert('網路逾時，請重試。');
      document.getElementById('btn-submit-reg').disabled = false;
    }
  });
}

function renderPageData(member) {
  document.getElementById('user-avatar').src = member.linePictureUrl || 'https://via.placeholder.com/150';
  document.getElementById('user-name').innerText = member.lineDisplayName;
  document.getElementById('member-id-text').innerText = member.memberId; 

  // 👑 消除長串小數點
  document.getElementById('total-reward').innerText = `NT$ ${Number(member.totalReward).toFixed(0)}`;
  document.getElementById('withdrawable').innerText = `NT$ ${Number(member.remainingWithdrawable).toFixed(1)}`;
  document.getElementById('shopping-fund').innerText = `NT$ ${Number(member.remainingShoppingFund).toFixed(1)}`;

  document.getElementById('ref-total-count').innerText = `${member.referralTotalCount} 人`;
  document.getElementById('ref-today-count').innerText = `${member.todayReferralCheckinCount} 人`;
  document.getElementById('share-url-input').value = member.referralLink;

  const statusBadge = document.getElementById('checkin-status');
  const checkinBtn = document.getElementById('btn-checkin');
  if (member.checkedInToday) {
    statusBadge.innerText = "今日已完成簽到";
    statusBadge.className = "status-badge status-done";
    checkinBtn.innerText = "明天再來簽到吧！";
    checkinBtn.disabled = true;
  } else {
    statusBadge.innerText = "尚未簽到";
    statusBadge.className = "status-badge status-not";
    checkinBtn.innerText = "今日簽到";
    checkinBtn.disabled = false;
  }

  // 👑 滿 1000 元提領物理防禦鎖
  const withdrawBtn = document.getElementById('btn-withdraw-ui');
  const withdrawHint = document.getElementById('withdraw-hint');
  const cashAmount = Number(member.remainingWithdrawable);
  
  if (cashAmount >= -1 {
    withdrawBtn.disabled = false;
    withdrawHint.style.color = "#2e7d32";
    withdrawHint.innerText = `※ 您已達提領門檻，當前可全額提領`;
  } else {
    withdrawBtn.disabled = true;
    withdrawHint.style.color = "#c62828";
    withdrawHint.innerText = `※ 滿 NT$ 1,000 即可申請提領`;
  }

  let nextLevelText = "1) 自己簽到 (1元)";
  if (member.purchasedOneBox === '是' || member.purchasedOneBox === '慢') {
    nextLevelText = "5) 本人+下線購盒 (10元)";
  } else if (member.todayReferralCheckinCount >= 30) {
    nextLevelText = "4) 自己+推薦30人簽到 (5元)";
  } else if (member.todayReferralCheckinCount >= 20) {
    nextLevelText = "3) 自己+推薦20人簽到 (3元)";
  } else if (member.todayReferralCheckinCount >= 10) {
    nextLevelText = "2) 自己+推薦10人簽到 (2元)";
  }
  document.getElementById('expected-level').innerText = nextLevelText;
}

// 👑 點擊簽到：物理優先鎖死，徹底防禦重覆點擊
document.getElementById('btn-checkin').addEventListener('click', async () => {
  if (!currentUserData || isSubmitting) return;
  
  isSubmitting = true;
  const checkinBtn = document.getElementById('btn-checkin');
  checkinBtn.disabled = true;
  checkinBtn.innerText = '簽到處理中...';

  try {
    const response = await fetch(FRONTEND_CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'checkIn', lineUserId: currentUserData.lineUserId })
    });
    const result = await response.json();

    if (result.success) {
      // 👑 關鍵：先渲染前台，讓按鈕完全在畫面上反灰死鎖
      renderPageData(result.member);
      
      // 👑 最後慢半拍才彈出成功提示
      setTimeout(() => {
        alert(`🎉 簽到成功！\n今日獲得：${result.todayReward.amount} 元\n(可提領: ${Number(result.todayReward.withdrawable).toFixed(1)} 元 / 購物基金: ${Number(result.todayReward.shoppingFund).toFixed(1)} 元)`);
      }, 150);
    } else {
      alert('簽到失敗：' + result.message);
      checkinBtn.disabled = false;
      checkinBtn.innerText = '今日簽到';
    }
  } catch (error) {
    alert('連線失敗，請稍後再試。');
    checkinBtn.disabled = false;
    checkinBtn.innerText = '今日簽到';
  } finally {
    isSubmitting = false;
  }
});

// --- 💰 申請提領彈窗與自動記憶判斷 ---
const withdrawModal = document.getElementById('withdraw-modal');
document.getElementById('btn-withdraw-ui').addEventListener('click', () => {
  if (!currentUserData || Number(currentUserData.remainingWithdrawable) < -1) return;
  
  document.getElementById('w-amount').value = `NT$ ${Number(currentUserData.remainingWithdrawable).toFixed(1)}`;
  
  const inputs = ['w-idcard', 'w-bankname', 'w-bankcode', 'w-bankbranch', 'w-bankacc', 'w-bankuser'];
  
  if (historyBankData) {
    // 👑 老會員：自動帶入歷史成功數據，並設定成「唯讀」
    document.getElementById('modal-title').innerText = "核對提領帳戶資料";
    document.getElementById('modal-sub-hint').style.display = "block";
    
    document.getElementById('w-idcard').value = historyBankData.idCard;
    document.getElementById('w-bankname').value = historyBankData.bankName;
    document.getElementById('w-bankcode').value = historyBankData.bankCode;
    document.getElementById('w-bankbranch').value = historyBankData.bankBranch;
    document.getElementById('w-bankacc').value = historyBankData.bankAcc;
    document.getElementById('w-bankuser').value = historyBankData.bankUser;
    
    inputs.forEach(id => document.getElementById(id).readOnly = true);
  } else {
    // 新會員：顯示空白輸入框
    document.getElementById('modal-title').innerText = "填寫初次提領帳戶資料";
    document.getElementById('modal-sub-hint').style.display = "none";
    
    inputs.forEach(id => {
      document.getElementById(id).value = "";
      document.getElementById(id).readOnly = false;
    });
  }
  
  withdrawModal.style.display = 'flex';
});

document.getElementById('btn-withdraw-cancel').addEventListener('click', () => {
  withdrawModal.style.display = 'none';
});

document.getElementById('btn-withdraw-submit').addEventListener('click', async () => {
  const idCard = document.getElementById('w-idcard').value.trim();
  const bankName = document.getElementById('w-bankname').value.trim();
  const bankCode = document.getElementById('w-bankcode').value.trim();
  const bankBranch = document.getElementById('w-bankbranch').value.trim();
  const bankAcc = document.getElementById('w-bankacc').value.trim();
  const bankUser = document.getElementById('w-bankuser').value.trim();

  if (!idCard || !bankName || !bankCode || !bankBranch || !bankAcc || !bankUser) {
    return alert('為了完成對帳，所有欄位皆必須填寫！');
  }
  if (!/^[A-Z][12]\d{8}$/.test(idCard.toUpperCase())) {
    return alert('身份證字號格式錯誤');
  }

  const submitBtn = document.getElementById('btn-withdraw-submit');
  submitBtn.disabled = true;
  submitBtn.innerText = '處理中...';

  try {
    const response = await fetch(FRONTEND_CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'submitWithdraw',
        lineUserId: currentUserData.lineUserId,
        withdrawData: {
          amount: currentUserData.remainingWithdrawable, 
          idCard: idCard.toUpperCase(),
          bankName: bankName,
          bankCode: bankCode,
          bankBranch: bankBranch,
          bankAcc: bankAcc,
          bankUser: bankUser
        }
      })
    });
    const result = await response.json();

    if (result.success) {
      withdrawModal.style.display = 'none';
      
      // 更新記憶體中的歷史帳戶，下次直接帶入
      historyBankData = { idCard, bankName, bankCode, bankBranch, bankAcc, bankUser };
      renderPageData(result.member);
      
      // 👑 方案 B 優化文案提示
      setTimeout(() => {
        alert("🎉 您的提領申請已提交成功！\n\n資料已安全寫入後台審核系統。\n\n※ 撥款重要通知：提領款項將於「每週五」統一匯入您指定的帳戶。如遇例假日則順延發放，感謝您的配合與體諒。");
      }, 150);
    } else {
      alert('提領失敗：' + result.message);
    }
  } catch (e) {
    alert('網路連線失敗');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = '確認送出申請';
  }
});

// 複製連結與分享
document.getElementById('btn-copy').addEventListener('click', () => {
  const copyText = document.getElementById('share-url-input');
  copyText.select();
  copyText.setSelectionRange(0, 99999);
  navigator.clipboard.writeText(copyText.value);
  alert('📋 推薦連結複製成功！');
});

document.getElementById('btn-share').addEventListener('click', async () => {
  if (!currentUserData) return;
  if (liff.isApiAvailable('shareTargetPicker')) {
    try {
      await liff.shareTargetPicker([
        {
          type: "text",
          text: `👋 哈囉！邀請你一起加入「動元力國際」每日簽到賺購物金！\n\n點擊我的專屬連結完成開通，天天簽到天天領👇\n${currentUserData.referralLink}`
        }
      ]);
    } catch (e) { console.log(e); }
  } else {
    alert('當前環境不支援直接分享，請複製連結轉傳。');
  }
});
