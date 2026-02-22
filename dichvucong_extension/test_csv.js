const fs = require('fs');

function parseAndFilterCSV(text) {
    const lines = text.split('\n');
    if (lines.length < 2) return [];

    // Tìm index của các cột bằng Regex (bảo vệ dấu phẩy nằm trong ngoặc kép)
    const headers = lines[0].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(h => h.trim().replace(/^"|"$/g, ''));
    console.log("Headers length:", headers.length);
    const nameIdx = headers.findIndex(h => h === 'Họ và tên');
    const idIdx = headers.findIndex(h => h.includes('Số CC') || h.includes('định danh') || h === 'Số CC/ CCCD/ Số định danh');
    const checkinIdx = headers.findIndex(h => h === 'Check in');
    const statusIdx = headers.findIndex(h => h === 'Trang thai' || h === 'Trạng thái');

    console.log("Found Indexes:", { nameIdx, idIdx, checkinIdx, statusIdx });

    if (nameIdx === -1 || idIdx === -1) {
        console.log('Error: Missing Name or ID column');
        return [];
    }

    const results = [];
    for (let i = 1; i < Math.min(lines.length, 5); i++) {
        if (!lines[i].trim()) continue;

        const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(item => item.trim().replace(/^"|"$/g, ''));

        const checkin = (row[checkinIdx] || '').trim();
        const status = (row[statusIdx] || '').trim();

        console.log(`Row ${i}: Checkin='${checkin}', Status='${status}'`);

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

const data = fs.readFileSync('/Users/sonpc/Downloads/Thông tin đăng ký khoá tu tại chùa Từ Đức - Data.csv', 'utf8');
const res = parseAndFilterCSV(data);
console.log("Final matched results:", res.length);
