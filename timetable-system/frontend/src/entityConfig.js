export const TYPE_OPTIONS = ['Theory', 'Lab'];
const short = (days) => days.split(',').map((d) => d.slice(0, 3)).join(', ');

export const ENTITIES = {
  teachers: {
    title: 'Teachers', single: 'Teacher', icon: 'users', slotKey: 'teacherId',
    blurb: 'Faculty members, their leave days and workload limits.',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'department', label: 'Department' },
      { key: 'email', label: 'Email' },
      { key: 'maxPerDay', label: 'Max lectures / day', type: 'number' },
      { key: 'maxPerWeek', label: 'Max lectures / week', type: 'number' },
      { key: 'unavailableDays', label: 'Leave / unavailable days', type: 'days' },
    ],
    subtitle: (it) => it.department || 'Faculty',
    chips: (it) => [
      it.email,
      it.maxPerDay && `Max ${it.maxPerDay}/day`,
      it.maxPerWeek && `Max ${it.maxPerWeek}/week`,
      it.unavailableDays && `Leave: ${short(it.unavailableDays)}`,
    ].filter(Boolean),
    bar: (it, count) => {
      const max = Number(it.maxPerWeek) || 0;
      return { label: `${count}${max ? ` / ${max}` : ''} lectures per week`, value: count, max: max || Math.max(count, 10) };
    },
  },
  subjects: {
    title: 'Subjects', single: 'Subject', icon: 'book', slotKey: 'subjectId',
    blurb: 'Courses taught in your college. Lab subjects need lab rooms.',
    fields: [
      { key: 'name', label: 'Subject name' },
      { key: 'code', label: 'Code' },
      { key: 'type', label: 'Needs room type', type: 'select', options: TYPE_OPTIONS },
    ],
    subtitle: (it) => it.code || 'Subject',
    chips: (it) => [it.type || 'Theory'],
  },
  classes: {
    title: 'Classes', single: 'Class', icon: 'cap', slotKey: 'classId',
    blurb: 'Sections and batches, with their strength for room matching.',
    fields: [
      { key: 'name', label: 'Class / Section' },
      { key: 'semester', label: 'Semester' },
      { key: 'strength', label: 'Number of students', type: 'number' },
    ],
    subtitle: (it) => (it.semester ? `Semester ${it.semester}` : 'Class'),
    chips: (it) => [it.strength && `${it.strength} students`].filter(Boolean),
  },
  rooms: {
    title: 'Rooms', single: 'Room', icon: 'building', slotKey: 'roomId',
    blurb: 'Classrooms and labs with capacity and opening hours.',
    fields: [
      { key: 'name', label: 'Room name' },
      { key: 'capacity', label: 'Capacity (seats)', type: 'number' },
      { key: 'type', label: 'Room type', type: 'select', options: TYPE_OPTIONS },
      { key: 'availableFrom', label: 'Available from period', type: 'number' },
      { key: 'availableTo', label: 'Available to period', type: 'number' },
      { key: 'unavailableDays', label: 'Closed on days', type: 'days' },
    ],
    subtitle: (it) => `${it.type === 'Lab' ? 'Lab' : 'Theory'} room`,
    chips: (it) => [
      it.type === 'Lab' ? 'Lab' : 'Theory',
      it.capacity && `${it.capacity} seats`,
      (it.availableFrom || it.availableTo) && `Periods ${it.availableFrom || 1}-${it.availableTo || 8}`,
      it.unavailableDays && `Closed: ${short(it.unavailableDays)}`,
    ].filter(Boolean),
    bar: (it, count, ctx) => ({ label: `${count} of ${ctx.totalSlots} weekly slots used`, value: count, max: ctx.totalSlots || 1 }),
  },
};
