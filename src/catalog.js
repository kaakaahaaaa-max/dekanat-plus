// Каталог справок и заявлений. Сервер принимает только поля, описанные здесь.
const FORMAT = {
  name: 'format', label: 'Как получить', type: 'select', required: true,
  options: [['electronic', 'Электронно, с QR-кодом — сразу в кабинет'], ['paper', 'На бланке — заберу в учебном отделе']],
};
const COPIES = { name: 'copies', label: 'Количество экземпляров', type: 'number', min: 1, max: 5, required: true, default: 1 };

const REQUEST_TYPES = [
  {
    id: 'study_certificate', group: 'certificate', title: 'Справка об обучении', eta: '1 рабочий день', electronic: true,
    hint: 'Подтверждает, что вы учитесь в университете. Подходит для банка, соцзащиты, работы.',
    fields: [{ name: 'destination', label: 'Куда нужна справка', type: 'text', placeholder: 'Например: по месту требования', required: true, max: 120 }, COPIES, FORMAT],
  },
  {
    id: 'scholarship_certificate', group: 'certificate', title: 'Справка о стипендии', eta: '2 рабочих дня', electronic: true,
    hint: 'Размер стипендии за выбранный период — для соцзащиты или налогового вычета.',
    fields: [{ name: 'period', label: 'За какой период', type: 'select', required: true, options: [['3m', 'Последние 3 месяца'], ['6m', 'Последние 6 месяцев'], ['12m', 'Последний год']] }, COPIES, FORMAT],
  },
  {
    id: 'military', group: 'certificate', title: 'Справка для военкомата', eta: '3 рабочих дня', electronic: false,
    hint: 'Справка по форме для военного комиссариата. Выдаётся только на бланке.',
    fields: [{ name: 'destination', label: 'Военкомат', type: 'text', placeholder: 'Район или город', required: true, max: 120 }, COPIES],
  },
  {
    id: 'employer_call', group: 'certificate', title: 'Справка-вызов для работодателя', eta: '3 рабочих дня', electronic: false,
    hint: 'Для учебного отпуска на работе во время сессии.',
    fields: [
      { name: 'destination', label: 'Организация', type: 'text', placeholder: 'Название работодателя', required: true, max: 120 },
      { name: 'period', label: 'Период', type: 'select', required: true, options: [['winter', 'Зимняя сессия'], ['summer', 'Летняя сессия']] },
    ],
  },
  {
    id: 'absence', group: 'application', title: 'Уважительная причина пропуска', eta: '1 рабочий день', electronic: false,
    hint: 'Сообщите о болезни или другой уважительной причине — деканат предупредит преподавателей.',
    fields: [
      { name: 'from', label: 'С какого дня', type: 'date', required: true },
      { name: 'to', label: 'По какой день', type: 'date', required: true },
      { name: 'reason', label: 'Причина', type: 'select', required: true, options: [['illness', 'Болезнь'], ['family', 'Семейные обстоятельства'], ['event', 'Участие в мероприятии от университета']] },
      { name: 'comment', label: 'Комментарий', type: 'textarea', required: false, max: 500, placeholder: 'Номер справки или что важно знать' },
    ],
  },
  {
    id: 'individual_term', group: 'application', title: 'Индивидуальный срок сдачи сессии', eta: '5 рабочих дней', electronic: false,
    hint: 'Если пропустили экзамены по уважительной причине.',
    fields: [
      { name: 'subjects', label: 'Какие дисциплины', type: 'text', required: true, max: 200 },
      { name: 'reason', label: 'Причина', type: 'textarea', required: true, max: 500 },
    ],
  },
  {
    id: 'individual_plan', group: 'application', title: 'Индивидуальный учебный план', eta: '10 рабочих дней', electronic: false,
    hint: 'Для тех, кто работает по специальности, участвует в соревнованиях или воспитывает ребёнка.',
    fields: [
      { name: 'reason', label: 'Основание', type: 'select', required: true, options: [['work', 'Работа по специальности'], ['sport', 'Спорт'], ['family', 'Воспитание ребёнка']] },
      { name: 'comment', label: 'Пояснение', type: 'textarea', required: false, max: 500 },
    ],
  },
  {
    id: 'academic_leave', group: 'application', title: 'Академический отпуск', eta: '10 рабочих дней', electronic: false,
    hint: 'Перерыв в учёбе по медицинским, семейным или иным основаниям.',
    fields: [
      { name: 'reason', label: 'Основание', type: 'select', required: true, options: [['medical', 'Медицинские показания'], ['family', 'Семейные обстоятельства'], ['army', 'Призыв на военную службу'], ['other', 'Другое']] },
      { name: 'from', label: 'С какой даты', type: 'date', required: true },
      { name: 'comment', label: 'Пояснение', type: 'textarea', required: false, max: 500 },
    ],
  },
  {
    id: 'financial_aid', group: 'application', title: 'Материальная помощь', eta: '14 дней', electronic: false,
    hint: 'Не забудьте указать подтверждающий документ — без него заявление вернут.',
    fields: [
      { name: 'reason', label: 'Причина', type: 'select', required: true, options: [['hardship', 'Трудная жизненная ситуация'], ['medical', 'Лечение'], ['family', 'Рождение ребёнка']] },
      { name: 'document', label: 'Подтверждающий документ', type: 'text', required: true, max: 200, placeholder: 'Например: справка о составе семьи от 01.11' },
      { name: 'comment', label: 'Комментарий', type: 'textarea', required: false, max: 500 },
    ],
  },
  {
    id: 'question', group: 'application', title: 'Вопрос в деканат', eta: '2 рабочих дня', electronic: false,
    hint: 'Если не нашли ответ в помощнике — спросите сотрудника напрямую.',
    fields: [{ name: 'text', label: 'Ваш вопрос', type: 'textarea', required: true, max: 1000 }],
  },
];

const BY_ID = Object.fromEntries(REQUEST_TYPES.map((t) => [t.id, t]));

// Проверка данных формы: только известные поля, ограничения длины и значений
function validateRequest(typeId, input) {
  const type = BY_ID[typeId];
  if (!type) return { error: 'Такого вида заявки нет' };
  const out = {};
  for (const f of type.fields) {
    let v = input?.[f.name];
    if (v === undefined || v === null || v === '') {
      if (f.required) return { error: `Заполните поле «${f.label}»` };
      continue;
    }
    v = String(v).trim();
    if (f.type === 'number') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < (f.min ?? 1) || n > (f.max ?? 10)) return { error: `Поле «${f.label}»: от ${f.min} до ${f.max}` };
      out[f.name] = n; continue;
    }
    if (f.type === 'select' && !f.options.some(([val]) => val === v)) return { error: `Поле «${f.label}»: выберите вариант из списка` };
    if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: `Поле «${f.label}»: укажите дату` };
    if (f.max && v.length > f.max) return { error: `Поле «${f.label}»: не длиннее ${f.max} символов` };
    out[f.name] = v;
  }
  if (out.from && out.to && out.to < out.from) return { error: 'Дата окончания раньше даты начала' };
  return { type, details: out };
}

module.exports = { REQUEST_TYPES, BY_ID, validateRequest };
