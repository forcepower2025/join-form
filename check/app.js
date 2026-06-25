// 全局儲存後端傳回的會員狀態
let currentUserData = null;

// 當網頁一開啟，立刻啟動初始化
window.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. 初始化 LINE LIFF SDK
    await liff.init({ liffId: FRONTEND_CONFIG.LIFF_ID });

    // 2. 檢查使用者是否已經在 LINE 中登入
    if (!liff.isLoggedIn()) {
      // 若沒登入（例如用一般瀏覽器打開），強制觸發 LINE 登入
      liff.login();
      return;
    }

    // 3. 👑 核心安全與自動偵測：拔下加密的 idToken
    const idToken = liff.getIDToken();

    // 4. 抓取網址上的推薦人 ref 碼 (例如 ?ref=M000001)
    const urlParams = new URLSearchParams(window.location.search);
    const refMemberId = urlParams.get('ref') || '';

    // 5. 將 Token 送給試算表後端，後端會「自動偵測是否有會員，沒會員自動建立綁定」
    const response = await fetch(FRONTEND_CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // 避免 GAS 引發 CORS 預檢請求問題
      body: JSON.stringify({
        action: 'bindLine',
        idToken: idToken,
        refMemberId: refMemberId
      })
    });

    const result = await response.json();

    if (result.success) {
      currentUserData = result.member;
      // 6. 驗證/綁定成功，將資料渲染到畫面上並切換畫面
      renderPageData(currentUserData);
      
      // 關閉 Loading 畫面，打開主要簽到畫面
      document.getElementById('loading-page').style.display = 'none';
      document.getElementById('main-page').style.display = 'block';
    } else {
      alert('動元力系統驗證失敗：' + result.message);
    }

  } catch (error) {
    console.error(error);
    alert('系統初始化發生錯誤，請重新從官方 LINE 選單開啟。');
  }
});

/**
 * 將後端回傳的會員資料渲染至網頁畫面上
 */
function renderPageData(member) {
  // 填入大頭貼與名字、編號
  document.getElementById('user-avatar').src = member.linePictureUrl || 'https://via.placeholder.com/150';
  document.getElementById('user-name').innerText = member.lineDisplayName;
  document.getElementById('member-id-text').innerText = member.memberId;

  // 填入資產數據
  document.getElementById('total-reward').innerText = `NT$ ${member.totalReward}`;
  document.getElementById('withdrawable').innerText = `NT$ ${member.remainingWithdrawable}`;
  document.getElementById('shopping-fund').innerText = `NT$ ${member.remainingShoppingFund}`;

  // 填入團隊數據
  document.getElementById('ref-total-count').innerText = `${member.referralTotalCount} 人`;
  document.getElementById('ref-today-count').innerText = `${member.todayReferralCheckinCount} 人`;

  // 生成並填入推薦連結
  document.getElementById('share-url-input').value = member.referralLink;

  // 判斷今日可預計獲得的獎勵級距文字
  let nextLevelText = "1) 自己簽到 (1元)";
  if (member.purchasedOneBox === '是') {
    nextLevelText = "5) 本人+下線購盒 (10元)";
  } else if (member.todayReferralCheckinCount >= 30) {
    nextLevelText = "4) 自己+推薦30人簽到 (5元)";
  } else if (member.todayReferralCheckinCount >= 20) {
    nextLevelText = "3) 自己+推薦20人簽到 (3元)";
  } else if (member.todayReferralCheckinCount >= 10) {
    nextLevelText = "2) 自己+推薦10人簽到 (2元)";
  }
  document.getElementById('expected-level').innerText = nextLevelText;

  // 判斷今日簽到狀態與按鈕開關
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
}

/**
 * 點擊「今日簽到」按鈕觸發事件
 */
document.getElementById('btn-checkin').addEventListener('click', async () => {
  if (!currentUserData) return;
  
  const checkinBtn = document.getElementById('btn-checkin');
  checkinBtn.disabled = true;
  checkinBtn.innerText = '簽到處理中...';

  try {
    const response = await fetch(FRONTEND_CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'checkIn',
        lineUserId: currentUserData.lineUserId
      })
    });

    const result = await response.json();

    if (result.success) {
      alert(`🎉 簽到成功！\n今日獲得：${result.todayReward.amount} 元\n(可提領: ${result.todayReward.withdrawable} 元 / 購物基金: ${result.todayReward.shoppingFund} 元)`);
      // 重新刷新畫面上的資產數據
      renderPageData(result.member);
    } else {
      alert('簽到失敗：' + result.message);
      // 失敗時恢復按鈕
      checkinBtn.disabled = false;
      checkinBtn.innerText = '今日簽到';
    }
  } catch (error) {
    alert('連線外網失敗，請稍後再試。');
    checkinBtn.disabled = false;
    checkinBtn.innerText = '今日簽到';
  }
});

/**
 * 按鈕事件：複製推薦連結
 */
document.getElementById('btn-copy').addEventListener('click', () => {
  const copyText = document.getElementById('share-url-input');
  copyText.select();
  copyText.setSelectionRange(0, 99999); // 針對手機優化
  navigator.clipboard.writeText(copyText.value);
  alert('📋 推薦連結複製成功！快傳給好友吧！');
});

/**
 * 👑 按鈕事件：一鍵分享給 LINE 好友 (利用 shareTargetPicker 功能)
 */
document.getElementById('btn-share').addEventListener('click', async () => {
  if (!currentUserData) return;

  // 檢查當前 LIFF 是否支援 shareTargetPicker
  if (liff.isApiAvailable('shareTargetPicker')) {
    try {
      const res = await liff.shareTargetPicker([
        {
          type: "text",
          text: `👋 哈囉！邀請你一起加入「動元力國際」每日簽到賺購物金！\n\n點擊我的專屬連結完成綁定，天天簽到天天領，還能跟我一起累積更多喔！👇\n${currentUserData.referralLink}`
        }
      ]);
      
      if (res) {
        alert('🚀 已成功分享給您指定的 LINE 好友！');
      }
    } catch (error) {
      console.log('分享取消或發生錯誤', error);
    }
  } else {
    alert('當前環境不支援直接分享，請使用「複製連結」功能手動轉傳。');
  }
});
