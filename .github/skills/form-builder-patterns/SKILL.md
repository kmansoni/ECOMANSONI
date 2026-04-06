---
name: form-builder-patterns
description: "Паттерны форм: React Hook Form, Zod валидация, составные формы, field arrays, conditional fields, submit pending state. Use when: форма, React Hook Form, Zod, валидация, форма отправки, поля формы, form validation."
argument-hint: "[тип формы: login | profile | search | wizard | all]"
---

# Form Builder Patterns — Паттерны форм

---

## React Hook Form + Zod (стандарт проекта)

```typescript
// src/components/settings/ProfileForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const profileSchema = z.object({
  display_name: z.string()
    .min(2, 'Минимум 2 символа')
    .max(50, 'Максимум 50 символов')
    .regex(/^[а-яёА-ЯЁa-zA-Z0-9\s_-]+$/, 'Недопустимые символы'),
  bio: z.string().max(500, 'Максимум 500 символов').optional(),
  phone: z.string()
    .regex(/^\+7\d{10}$/, 'Формат: +7XXXXXXXXXX')
    .optional()
    .or(z.literal('')),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export function ProfileForm({ initialData }: { initialData: Partial<ProfileFormData> }) {
  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: initialData,
  });

  const onSubmit = async (data: ProfileFormData) => {
    const { error } = await supabase.from('profiles').update(data).eq('id', userId);
    if (error) toast.error('Ошибка сохранения');
    else toast.success('Профиль обновлён');
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="display_name">Имя</label>
        <input
          {...register('display_name')}
          id="display_name"
          aria-describedby="display_name-error"
          className={errors.display_name ? 'border-red-500' : ''}
        />
        {errors.display_name && (
          <p id="display_name-error" role="alert" className="text-sm text-red-500">
            {errors.display_name.message}
          </p>
        )}
      </div>

      <button type="submit" disabled={isSubmitting || !isDirty}>
        {isSubmitting ? 'Сохранение...' : 'Сохранить'}
      </button>
    </form>
  );
}
```

---

## Field Array (динамические поля)

```typescript
import { useFieldArray } from 'react-hook-form';

// Форма с произвольным числом телефонов
const schema = z.object({
  phones: z.array(z.object({
    number: z.string().regex(/^\+7\d{10}$/),
    label: z.string().default('Основной'),
  })).max(3, 'Максимум 3 номера'),
});

function PhonesForm() {
  const { control, register } = useForm({ resolver: zodResolver(schema) });
  const { fields, append, remove } = useFieldArray({ control, name: 'phones' });

  return (
    <>
      {fields.map((field, i) => (
        <div key={field.id}>
          <input {...register(`phones.${i}.number`)} placeholder="+7XXXXXXXXXX" />
          <button type="button" onClick={() => remove(i)}>Удалить</button>
        </div>
      ))}
      {fields.length < 3 && (
        <button type="button" onClick={() => append({ number: '', label: 'Доп.' })}>
          + Добавить номер
        </button>
      )}
    </>
  );
}
```

---

## Conditional Fields

```typescript
// Показывать поле в зависимости от значения другого
const shippingSchema = z.discriminatedUnion('delivery_type', [
  z.object({
    delivery_type: z.literal('pickup'),
    // Нет адреса для самовывоза
  }),
  z.object({
    delivery_type: z.literal('courier'),
    address: z.string().min(10, 'Укажите адрес доставки'),
  }),
]);

function DeliveryForm() {
  const { watch, register } = useForm({ resolver: zodResolver(shippingSchema) });
  const deliveryType = watch('delivery_type');

  return (
    <>
      <select {...register('delivery_type')}>
        <option value="pickup">Самовывоз</option>
        <option value="courier">Курьер</option>
      </select>
      {deliveryType === 'courier' && (
        <input {...register('address')} placeholder="Адрес доставки" />
      )}
    </>
  );
}
```

---

## Чеклист

- [ ] Zod schema определена отдельно (используется для type inference)
- [ ] Все поля имеют label с htmlFor (accessibility)
- [ ] Ошибки показываются с role="alert" и aria-describedby
- [ ] Submit кнопка disabled во время isSubmitting
- [ ] isDirty проверка — не сохранять если ничего не изменилось
- [ ] defaultValues установлены (контролируемая форма)
- [ ] Очистить форму после успешной отправки (reset())
