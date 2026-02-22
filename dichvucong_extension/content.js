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

// Giả lập nhập text vào ô input của các platform React/Vue
function setInputValue(inputEl, value) {
    inputEl.value = value;
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
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

        // 2. Định dạng lại DOM selector dựa vào phân tích thực tế
        let nameInput = document.querySelector('input#guest_txtCITIZENNAME');
        let cccdInput = document.querySelector('input#guest_txtIDCARD_NUMBER');
        let reasonInput = document.querySelector('textarea#guest_txtREASON');

        if (nameInput) setInputValue(nameInput, user.hoTen);
        if (cccdInput) setInputValue(cccdInput, user.soCCCD);
        if (reasonInput) setInputValue(reasonInput, user.lyDo);

        // Đợi 1 chút cho frontend validate
        await sleep(1000);

        // 3. Tìm và bấm Lưu
        let saveBtn = document.querySelector('button#btnSaveNLT');
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
