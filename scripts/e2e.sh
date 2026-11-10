set -u
B=${BASE_URL:-http://localhost:3000}; H='X-Requested-With: dekanat'; J='Content-Type: application/json'; D=$(mktemp -d)
pass(){ echo "✓ $1"; }; fail(){ echo "✗ $1"; }
login(){ curl -s -c $D/$1.txt -H "$H" -H "$J" -d "{\"login\":\"$1\",\"password\":\"$2\"}" $B/api/login >/dev/null; }
login anna 'Anna2026!'; login maxim 'Maxim2026!'; login staff 'Staff2026!'
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }
[ "$(code -b $D/anna.txt $B/api/requests/3)" = 404 ] && pass "Анна не видит заявку Максима по прямому адресу (404)" || fail "чужая заявка"
[ "$(code -b $D/anna.txt $B/doc/3)" = 404 ] && pass "Анна не может открыть чужую справку" || fail "чужая справка"
[ "$(code $B/api/today)" = 401 ] && pass "Без входа данные недоступны (401)" || fail "анонимный доступ"
[ "$(code -b $D/anna.txt -X PATCH -H "$H" -H "$J" -d '{"status":"ready"}' $B/api/staff/requests/3)" = 403 ] && pass "Студент не может менять статусы (403)" || fail "роль"
[ "$(code -b $D/anna.txt -X POST -H "$J" -d '{"type":"question","details":{"text":"тест"}}' $B/api/requests)" = 403 ] && pass "Запрос без заголовка фронтенда отклонён (защита от CSRF)" || fail "csrf"
[ "$(code -H "$H" -H "$J" -d '{"login":"anna","password":"wrong"}' $B/api/login)" = 401 ] && pass "Неверный пароль не пускает" || fail "пароль"
curl -s -b $D/anna.txt $B/api/requests | grep -q 'Петренко\|военкомата' && fail "в списке Анны чужие данные" || pass "Список заявок Анны содержит только её заявки"
node --no-warnings -e "const {db}=require('./src/db');const r=db.prepare('select login,password_hash from users').all();console.log(r.every(x=>x.password_hash.startsWith('\$2'))?'✓ Пароли хранятся как bcrypt-хеши':'✗ пароли')"
# Полный сценарий
ID=$(curl -s -b $D/anna.txt -H "$H" -H "$J" -d '{"type":"study_certificate","details":{"destination":"Банк","copies":1,"format":"electronic"}}' $B/api/requests | node -pe 'JSON.parse(require("fs").readFileSync(0)).request.id')
[ -n "$ID" ] && pass "Анна подала заявку №$ID" || fail "подача"
[ "$(code -b $D/staff.txt -X PATCH -H "$H" -H "$J" -d '{"status":"ready","comment":"Готово"}' $B/api/staff/requests/$ID)" = 200 ] && pass "Сотрудник отметил справку готовой" || fail "смена статуса"
curl -s -b $D/anna.txt $B/api/notifications | grep -q 'Справка об обучении: готова' && pass "Анне пришло уведомление" || fail "уведомление"
[ "$(code -b $D/anna.txt $B/doc/$ID)" = 200 ] && pass "Электронная справка открывается" || fail "справка"
VC=$(node --no-warnings -e "const {db}=require('./src/db');console.log(db.prepare('select verify_code from requests where id=?').get($ID).verify_code)")
curl -s $B/verify/$VC | grep -q 'Документ действителен' && pass "QR-проверка подлинности работает" || fail "verify"
curl -s -b $D/anna.txt -H "$H" -H "$J" -d '{"question":"как пересдать экзамен"}' $B/api/assistant | grep -q 'Пересдача' && pass "Помощник отвечает" || fail "помощник"
for i in $(seq 1 11); do c=$(code -H "$H" -H "$J" -d '{"login":"x","password":"y"}' $B/api/login); done; [ "$c" = 429 ] && pass "Подбор пароля блокируется после 10 попыток" || fail "rate limit ($c)"
