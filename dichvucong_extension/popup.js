document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('csvFileInput');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const resetBtn = document.getElementById('resetBtn');
  const statusText = document.getElementById('statusText');
  const progressText = document.getElementById('progressText');

  let parsedData = [];

  // Update UI logic
  function updateUI(state) {
    if (state.isRunning) {
      startBtn.disabled = true;
      pauseBtn.disabled = false;
      fileInput.disabled = true;
      statusText.innerText = "Trạng thái: Đang chạy tự động...";
      statusText.style.color = "#1a73e8";
    } else {
      startBtn.disabled = parsedData.length === 0;
      pauseBtn.disabled = true;
      fileInput.disabled = false;
      if (parsedData.length > 0) {
        statusText.innerText = "Trạng thái: Sẵn sàng chạy";
        statusText.style.color = "green";
      } else {
        statusText.innerText = "Trạng thái: Chưa tải file";
        statusText.style.color = "#d93025";
      }
    }
    progressText.innerText = `Tiến độ: ${state.currentIndex || 0} / ${state.total || parsedData.length}`;
  }

  // Khôi phục trạng thái từ Storage
  chrome.storage.local.get(['automationState', 'formData'], (res) => {
    if (res.formData) {
      parsedData = res.formData;
    }
    const state = res.automationState || { isRunning: false, currentIndex: 0, total: parsedData.length };
    updateUI(state);
  });

  // Xử lý tải file CSV
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
      const text = event.target.result;
      parsedData = parseAndFilterCSV(text);

      const state = { isRunning: false, currentIndex: 0, total: parsedData.length };
      chrome.storage.local.set({ formData: parsedData, automationState: state }, () => {
        updateUI(state);
        if (parsedData.length === 0) {
          alert('Không tìm thấy dữ liệu nào thoả mãn: Check in = "Y" và Trang thai = "Dat"');
        }
      });
    };
    reader.readAsText(file);
  });

  startBtn.addEventListener('click', () => {
    chrome.storage.local.get(['automationState'], (res) => {
      const state = res.automationState || { currentIndex: 0, total: parsedData.length };
      state.isRunning = true;
      chrome.storage.local.set({ automationState: state }, () => {
        updateUI(state);
        // Gửi thông báo tới tab hiện tại để bắt đầu
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "START_AUTOMATION" });
          }
        });
      });
    });
  });

  pauseBtn.addEventListener('click', () => {
    chrome.storage.local.get(['automationState'], (res) => {
      if (res.automationState) {
        res.automationState.isRunning = false;
        chrome.storage.local.set({ automationState: res.automationState }, () => {
          updateUI(res.automationState);
          chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]) {
              chrome.tabs.sendMessage(tabs[0].id, { action: "STOP_AUTOMATION" });
            }
          });
        });
      }
    });
  });

  resetBtn.addEventListener('click', () => {
    const defaultState = { isRunning: false, currentIndex: 0, total: parsedData.length };
    chrome.storage.local.set({ automationState: defaultState }, () => {
      updateUI(defaultState);
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "STOP_AUTOMATION" });
        }
      });
    });
  });

  // Hàm parse CSV đơn giản, có xử lý quotes
  function parseAndFilterCSV(text) {
    const lines = text.split('\n');
    if (lines.length < 2) return [];

    // Tìm index của các cột bằng Regex (bảo vệ dấu phẩy nằm trong ngoặc kép)
    const headers = lines[0].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(h => h.trim().replace(/^"|"$/g, ''));
    const nameIdx = headers.findIndex(h => h === 'Họ và tên');
    const idIdx = headers.findIndex(h => h.includes('Số CC') || h.includes('định danh') || h === 'Số CC/ CCCD/ Số định danh');
    const checkinIdx = headers.findIndex(h => h === 'Check in');
    const statusIdx = headers.findIndex(h => h === 'Trang thai' || h === 'Trạng thái');

    if (nameIdx === -1 || idIdx === -1) {
      alert('File CSV không đúng định dạng. Cột "Họ và tên" hoặc "Số định danh" không tồn tại.');
      return [];
    }

    const results = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;

      // Xử lý split CSV có ngoặc kép
      const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(item => item.trim().replace(/^"|"$/g, ''));

      const checkin = (row[checkinIdx] || '').trim();
      const status = (row[statusIdx] || '').trim();

      if (checkin.toUpperCase() === 'Y' && status.toLowerCase() === 'dat') {
        results.push({
          hoTen: row[nameIdx],
          soCCCD: row[idIdx],
          lyDo: 'Tu Học'
        });
      }
    }
    return results;
  }

  // Lắng nghe thay đổi tiến độ từ content script để update UI nhanh
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.automationState) {
      updateUI(changes.automationState.newValue);
    }
  });
});
