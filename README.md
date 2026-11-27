# cnybb0415.github.io

## /office — 나영 비서실 (암호화 대시보드)

이 저장소는 공개라서 누구나 파일을 볼 수 있습니다. 그래서 비서실 현황 데이터는 **암호문으로만** 올립니다.

- `office/data/status.enc.json` — AES-256-GCM 암호문. 키는 비서실 열쇠에서 PBKDF2-SHA256 60만 회로 만듭니다.
- 열쇠·평문 `status.json`은 이 저장소에 절대 올리지 않습니다 (`.gitignore` 처리).
- 처음 여는 기기에서는 열쇠를 묻고, "이 기기 기억하기"를 켜면 그 기기에만 꺼낼 수 없는 키로 저장해 다음부터 PIN만 묻습니다.
- PIN을 5번 틀리면 그 기기의 키를 지우고 열쇠를 다시 묻습니다. PIN 확인값도 암호문 안에만 있습니다.

### 현황 데이터 고치는 법

1. 저장소 밖에 둔 평문 `status.json`을 고칩니다.
2. 봉인합니다.
   ```
   OFFICE_KEY="비서실 열쇠" OFFICE_PIN=4자리 node tools/seal-status.mjs <평문 status.json 경로>
   ```
3. 바뀐 `office/data/status.enc.json`만 커밋합니다.

열쇠를 바꾸려면 새 열쇠로 다시 봉인하면 됩니다. 이미 기억한 기기들은 "열쇠가 바뀌었어요" 화면에서 새 열쇠를 입력하게 됩니다.
