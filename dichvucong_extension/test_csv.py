import csv

def parse_csv(file_path):
    print(f"Reading file: {file_path}")
    results = []
    
    with open(file_path, newline='', encoding='utf-8') as csvfile:
        reader = csv.reader(csvfile)
        headers = next(reader)
        
        headers = [h.strip() for h in headers]
        
        try:
            name_idx = headers.index('Họ và tên')
            
            # Find ID index
            id_idx = -1
            for i, h in enumerate(headers):
                if 'Số CC' in h or 'định danh' in h.lower():
                    id_idx = i
                    break
                    
            checkin_idx = headers.index('Check in')
            status_idx = headers.index('Trạng thái') if 'Trạng thái' in headers else headers.index('Trang thai')
            
            print(f"Indexes: Name={name_idx}, ID={id_idx}, Checkin={checkin_idx}, Status={status_idx}")
            
        except ValueError as e:
            print("Lỗi nhận diện cột:", e)
            print("Headers:", headers)
            return

        for i, row in enumerate(reader):
            if i >= 5: break
            
            if len(row) > max(name_idx, id_idx, checkin_idx, status_idx):
                checkin = row[checkin_idx].strip()
                status = row[status_idx].strip()
                print(f"Row {i+1}: Name='{row[name_idx]}', Checkin='{checkin}', Status='{status}'")
                
                if checkin.upper() == 'Y' and status.lower() == 'dat':
                    results.append(row[name_idx])
                    
    print(f"\nFinal Matched Rows: {len(results)}")

parse_csv('/Users/sonpc/Downloads/Thông tin đăng ký khoá tu tại chùa Từ Đức - Data.csv')
