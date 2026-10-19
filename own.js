// Есть ли у объекта собственное свойство. Object.hasOwn здесь нельзя: его нет
// в iOS до 15.4 и в Chrome до 93, а вызовы стоят на пути запуска (openWorkout,
// проверка режима карты), так что на таких клиентах страница осталась бы пустой.
// Нужна именно проверка «собственное»: по `id in obj` или по голому obj[id]
// строка «constructor» из ненадёжного источника нашлась бы как ключ.
export const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
