let isRunning = false;
let checkInterval = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "START_AUTOMATION") {
        isRunning = true;
        startProcess();
    } else if (request.action === "STOP_AUTOMATION") {
        isRunning = false;
        if (checkInterval) clearInterval(checkInterval);
    }
});

// Chạy khi tải trang nếu state là isRunning
chrome.storage.local.get(['automationState'], (res) => {
    if (res.automationState && res.automationState.isRunning) {
        isRunning = true;
        startProcess();
    }
});

async function startProcess() {
    if (!isRunning) return;

    chrome.storage.local.get(['automationState', 'formData'], async (res) => {
        const state = res.automationState;
        const data = res.formData;

        if (!state || !state.isRunning || !data) return;
        if (state.currentIndex >= data.length) {
            // Done
            state.isRunning = false;
            chrome.storage.local.set({ automationState: state });
            alert("Đã hoàn thành nhập liệu!");
            return;
        }

        const currentUser = data[state.currentIndex];
        await processUser(currentUser, state, data);
    });
}

function getElementByXPath(xpath) {
    return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
}

// Giả lập nhập text vào ô input của các platform React/Vue/jQuery
function setInputValue(inputEl, value) {
    if (!inputEl) return;
    inputEl.focus();
    inputEl.value = value;
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 }));
    inputEl.blur();
    inputEl.dispatchEvent(new Event('blur', { bubbles: true }));
}

function formatDateToDDMMYYYY(dateString) {
    if (!dateString) return '';
    let d = dateString.split(' ')[0]; // cắt bỏ giờ phút nếu có
    let parts = d.split('/');
    if (parts.length === 3) {
        let p1 = parts[0].padStart(2, '0');
        let p2 = parts[1].padStart(2, '0');
        let p3 = parts[2];
        if (p3.length === 2) p3 = '20' + p3;
        return `${p1}/${p2}/${p3}`;
    }
    return d;
}

function getTodayDDMMYYYY() {
    let today = new Date();
    let dd = String(today.getDate()).padStart(2, '0');
    let mm = String(today.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${today.getFullYear()}`;
}

async function processUser(user, state, data) {
    try {
        // 1. Tìm thẻ nút "THÊM MỚI NGƯỜI LƯU TRÚ" (tuỳ giao diện thực tế, tìm bằng chữ và class)
        let addBtn = getElementByXPath("//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'thêm mới')] | //a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'thêm mới')]");

        // Nếu có nút thêm mới nghĩa là đang ở trang danh sách, click vào và đợi 1-2 giây cho form hiện ra
        if (addBtn && addBtn.offsetParent !== null) { // Đang hiển thị
            addBtn.click();
            await sleep(2000);
        }

        // 2. Định dạng lại DOM selector để chống lỗi trùng lặp ID (Duplicate ID) từ Website gốc
        // Lấy tất cả elements có ID đó, chọn ra cái nào đang thực sự hiển thị trên Layout (offsetParent !== null)
        let nameInputs = document.querySelectorAll('input#guest_txtCITIZENNAME');
        let nameInput = Array.from(nameInputs).find(el => el.offsetParent !== null) || nameInputs[nameInputs.length - 1];

        let cccdInputs = document.querySelectorAll('input#guest_txtIDCARD_NUMBER');
        let cccdInput = Array.from(cccdInputs).find(el => el.offsetParent !== null) || cccdInputs[cccdInputs.length - 1];

        // Tìm thẻ input Thời gian lưu trú (Từ ngày / Đến ngày)
        let dateFromInputs = document.querySelectorAll('input#guest_txtDATE_FROM, input[placeholder*="Từ ngày"]');
        let dateFromInput = Array.from(dateFromInputs).find(el => el.offsetParent !== null) || dateFromInputs[dateFromInputs.length - 1];

        let dateToInputs = document.querySelectorAll('input#guest_txtDATE_TO, input[placeholder*="Đến ngày"]');
        let dateToInput = Array.from(dateToInputs).find(el => el.offsetParent !== null) || dateToInputs[dateToInputs.length - 1];

        if (nameInput) setInputValue(nameInput, user.hoTen);
        if (cccdInput) setInputValue(cccdInput, user.soCCCD);
        if (reasonInput) setInputValue(reasonInput, user.lyDo);

        // Xử lý tự động gõ Ngày đến và Ngày đi
        if (dateFromInput && (!dateFromInput.value || dateFromInput.value.trim() === '')) {
            setInputValue(dateFromInput, getTodayDDMMYYYY());
        }
        if (dateToInput && user.ngayDi) {
            setInputValue(dateToInput, formatDateToDDMMYYYY(user.ngayDi));
        }

        // Đợi 1 chút cho frontend validate
        await sleep(1000);

        // 3. Tìm và bấm Lưu chống trùng lặp ID
        let saveBtns = document.querySelectorAll('button#btnSaveNLT');
        let saveBtn = Array.from(saveBtns).find(el => el.offsetParent !== null) || saveBtns[saveBtns.length - 1];
        if (saveBtn) {
            saveBtn.click();

            // Chờ request hoàn thành, tăng index và chạy người tiếp theo
            // Đợi khoảng 3s rồi chuyển sang người tiếp theo
            await sleep(3000);

            // Cập nhật storage
            state.currentIndex += 1;
            chrome.storage.local.set({ automationState: state }, () => {
                // Tùy trang web: nếu nó tự reload (sang màn hình danh sách) thì onload sẽ bắt được
                // Nếu nó ở lại trang hiện tại (dạng SPA), ta gọi đệ quy
                if (isRunning) {
                    startProcess();
                }
            });
        } else {
            console.error("Không tìm thấy nút Lưu lại!");
            // Tạm dừng nếu lỗi
            state.isRunning = false;
            chrome.storage.local.set({ automationState: state });
        }

    } catch (err) {
        console.error("Lỗi khi auto form", err);
        state.isRunning = false;
        chrome.storage.local.set({ automationState: state });
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
