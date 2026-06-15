import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as bcrypt from 'bcryptjs';
import {
  users, roles, userRoles, userSocials,
  hackathons, hackathonTags, hackathonTagRelations,
  stages, tracks,
  teams, teamMembers, teamApprovals, teamStage,
  projects, projectResources,
  mentorAvailabilities, mentorRequests,
  scores, criteria, judgeConflicts, judgeTrack,
} from '../drizzle/schema';
import * as schema from '../drizzle/schema';
import { env } from '../config/env';

const pool = new Pool({
  host: env.DB_HOST, port: env.DB_PORT,
  user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
});
const db = drizzle(pool, { schema });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const rnd  = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[rnd(0, arr.length - 1)];
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000);
const hoursAgo    = (h: number) => new Date(Date.now() - h * 3_600_000);
const shuffle = <T>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

// ─── Static data pools ────────────────────────────────────────────────────────

const UA_FIRST = [
  'Олександр','Іван','Микола','Андрій','Дмитро','Сергій','Павло','Богдан',
  'Артем','Максим','Ярослав','Кирило','Василь','Олег','Роман','Ігор',
  'Тарас','Євген','Владислав','Денис','Марія','Олена','Наталія','Юлія',
  'Тетяна','Ірина','Катерина','Вікторія','Аліна','Софія','Людмила','Дар\'я',
  'Оксана','Анна','Ганна','Лариса','Леся','Христина','Валентина','Надія',
  'Галина','Світлана','Любов','Мирослава','Орест','Остап','Соломія','Роксолана',
];
const UA_LAST = [
  'Коваленко','Шевченко','Бойко','Мельник','Ткаченко','Іваненко','Кравченко',
  'Олійник','Лисенко','Марченко','Павленко','Романенко','Захаренко','Гнатенко',
  'Дяченко','Сидоренко','Василенко','Кириленко','Петренко','Карпенко',
  'Яременко','Грищенко','Даниленко','Остапенко','Савченко','Бондаренко',
  'Панченко','Руденко','Литвиненко','Захарченко','Федоренко','Зінченко',
  'Поліщук','Тимошенко','Горобець','Прокопенко','Гончаренко','Безугла',
  'Костенко','Чорновіл','Стецьків','Луценко','Тягнибок','Береза',
];

const ALL_SKILLS = [
  'React','TypeScript','Node.js','Python','Go','Rust','Kotlin','Swift',
  'Vue.js','Angular','PostgreSQL','MongoDB','Redis','Docker','Kubernetes',
  'AWS','GCP','Azure','Terraform','CI/CD','GraphQL','FastAPI','Spring Boot',
  'Flutter','Dart','Android','iOS','ML','Data Science','Computer Vision',
  'NLP','Solidity','Blockchain','Figma','UI/UX','DevOps','Embedded','C++',
  'Java','PHP','Ruby','Elixir','Scala','Haskell','WebAssembly','Three.js',
];

const TEAM_NAME_PARTS_A = [
  'Byte','Code','Hash','Data','Pixel','Logic','Stack','Cyber','Cloud','Neural',
  'Algo','Quantum','Vector','Matrix','Forge','Hex','Null','Async','Deep','Smart',
  'Nova','Alpha','Sigma','Delta','Omega','Prime','Zero','Ultra','Hyper','Nano',
  'Vecto','Axon','Synth','Flux','Grid','Core','Link','Node','Edge','Arch',
];
const TEAM_NAME_PARTS_B = [
  'Force','Ninjas','Squad','Crew','Masters','Storm','Hunters','Legion','Pilots',
  'Rebels','Surge','Titans','Craft','Dragons','Beasts','Brigade','Wolves','Riders','Guild','Labs',
  'Coders','Hackers','Builders','Makers','Wizards','Rangers','Phoenix','Panda','Sharks','Eagles',
  'Tribe','Pack','Clan','Collective','Alliance','Union','Syndicate','Unit','Forge','Works',
];

const PROJECT_TITLES = [
  'EcoTrack','MedAI','LearnBot','SafeNet','FinFlow','SmartCity','GreenMeter',
  'ChainVault','TravelMind','CivicBoard','DataLens','AccessBridge','VitalSign',
  'CampusLink','AgriSense','PollutionGuard','SkillMatch','CareerPath','GamePilot',
  'SecureVault','BioMonitor','UrbanFlow','CloudMesh','CodeReview AI','HealthBot',
  'StudyBuddy','PeaceMap','SafeRoute','ClimateNet','EduQuest','TokenTrail',
  'NightGuard','FreelanceHub','MedChain','GovTransp','AirQuality','SoilSense',
  'WorkSync','MindBridge','CivicVoice','TradeFlow','RuralConnect','AquaGuard',
];

const PROJECT_DESCS = [
  'Платформа для моніторингу та аналізу даних у реальному часі.',
  'AI-рішення для автоматизації рутинних задач у бізнесі.',
  'Мобільний додаток для покращення доступності соціальних послуг.',
  'Блокчейн-система для прозорого управління грантами.',
  'Веб-застосунок для підключення волонтерів до НКО.',
  'Інструмент з відкритим кодом для аналізу якості коду.',
  'IoT-рішення для розумного управління ресурсами міста.',
  'Освітня платформа з персоналізованими навчальними шляхами.',
  'Фінтех-рішення для мікрокредитування малого бізнесу.',
  'Система раннього виявлення кіберзагроз для критичної інфраструктури.',
];

const HACKATHON_THEMES: Array<{
  prefix: string; subtitle: string; description: string; tags: string[];
  tracks: Array<{ name: string; desc: string; guidelines: string; outcome: string }>;
  online: boolean; location?: string; rulesUrl: string;
}> = [
  {
    prefix: 'AI Challenge',
    subtitle: 'Штучний інтелект та ML',
    description: 'Учасники змагаються у розробці інноваційних AI-рішень, що вирішують реальні проблеми суспільства. Очікуємо проєкти з NLP, Computer Vision та генеративного AI.',
    tags: ['ai/ml'],
    tracks: [
      { name: 'NLP & LLM', desc: 'Мовні моделі та чат-боти', guidelines: 'Оцінюється точність, швидкодія та інтерфейс взаємодії', outcome: 'Демонстрація моделі на реальних даних' },
      { name: 'Computer Vision', desc: 'Комп\'ютерний зір та обробка зображень', guidelines: 'Оцінюється метрики якості, датасет та відтворюваність', outcome: 'Задокументований пайплайн з результатами' },
    ],
    online: true, rulesUrl: 'https://hackflow.com/rules/ai-challenge',
  },
  {
    prefix: 'WebDev Sprint',
    subtitle: 'Швидка розробка веб-сервісів',
    description: 'Інтенсивний 48-годинний марафон для веб-розробників. Учасники створюють повноцінні веб-застосунки, що вирішують актуальні задачі українського бізнесу та суспільства.',
    tags: ['web'],
    tracks: [
      { name: 'Frontend', desc: 'Клієнтська частина та UX', guidelines: 'Оцінюється UX, адаптивність та продуктивність', outcome: 'Задеплоєний фронтенд-застосунок' },
      { name: 'Backend', desc: 'Серверна частина та API', guidelines: 'Оцінюється архітектура, безпека та документація API', outcome: 'Публічне API з документацією Swagger' },
    ],
    online: false, location: 'КПІ ім. Ігоря Сікорського, Київ', rulesUrl: 'https://hackflow.com/rules/webdev-sprint',
  },
  {
    prefix: 'Mobile Masters',
    subtitle: 'Мобільна розробка за 48 годин',
    description: 'Хакатон для мобільних розробників, де команди за 48 годин створюють мобільні застосунки, готові до публікації в App Store та Google Play.',
    tags: ['mobile'],
    tracks: [
      { name: 'iOS/Android', desc: 'Нативна мобільна розробка', guidelines: 'Оцінюється нативний UX, продуктивність та готовність до публікації', outcome: 'APK/IPA готовий до встановлення' },
      { name: 'Cross-Platform', desc: 'Flutter / React Native', guidelines: 'Оцінюється якість коду, шеринг логіки та UI', outcome: 'Застосунок на обох платформах' },
    ],
    online: true, rulesUrl: 'https://hackflow.com/rules/mobile-masters',
  },
  {
    prefix: 'CyberHack',
    subtitle: 'Кібербезпека та CTF',
    description: 'Змагання для спеціалістів з кібербезпеки. Включає Capture the Flag, пентестинг та розробку інструментів захисту. Призи від провідних компаній галузі.',
    tags: ['cybersecurity'],
    tracks: [
      { name: 'CTF', desc: 'Capture the Flag', guidelines: 'Оцінюється кількість захоплених прапорів та час', outcome: 'Звіт про знайдені вразливості' },
      { name: 'Pentesting', desc: 'Тестування на проникнення', guidelines: 'Оцінюється глибина аналізу та якість рекомендацій', outcome: 'Детальний звіт pentest з виправленнями' },
    ],
    online: true, rulesUrl: 'https://hackflow.com/rules/cyberhack',
  },
  {
    prefix: 'GreenTech Hack',
    subtitle: 'Сталий розвиток через технології',
    description: 'Хакатон присвячений технологічним рішенням для сталого розвитку та захисту навколишнього середовища. Партнери — провідні екологічні організації України.',
    tags: ['sustainability', 'iot'],
    tracks: [
      { name: 'Smart Energy', desc: 'Розумна енергія та оптимізація', guidelines: 'Оцінюється потенціал зменшення викидів CO2', outcome: 'Прототип або симуляція з розрахунками' },
      { name: 'Eco Monitoring', desc: 'Екомоніторинг та збір даних', guidelines: 'Оцінюється точність даних та масштабованість', outcome: 'IoT-пристрій або дашборд з реальними даними' },
    ],
    online: false, location: 'Unit.City, Київ', rulesUrl: 'https://hackflow.com/rules/greentech',
  },
  {
    prefix: 'FinCode',
    subtitle: 'Інновації у фінтеху',
    description: 'Хакатон для розробників фінансових технологій. Учасники вирішують реальні проблеми банківського сектору, страхування та платіжних систем.',
    tags: ['fintech'],
    tracks: [
      { name: 'Payments', desc: 'Платіжні рішення та транзакції', guidelines: 'Оцінюється безпека, швидкість та UX', outcome: 'Прототип платіжного рішення з тестами' },
      { name: 'InsurTech', desc: 'Страхові технології', guidelines: 'Оцінюється інноваційність та відповідність регулюванню', outcome: 'MVP страхового продукту' },
    ],
    online: false, location: 'Lviv IT Arena, Львів', rulesUrl: 'https://hackflow.com/rules/fincode',
  },
  {
    prefix: 'EduHack',
    subtitle: 'EdTech рішення майбутнього',
    description: 'Хакатон для творців освітніх технологій. Шукаємо рішення, що роблять освіту більш доступною, ефективною та захопливою для учнів усіх вікових груп.',
    tags: ['edtech'],
    tracks: [
      { name: 'E-Learning', desc: 'Онлайн-навчання та LMS', guidelines: 'Оцінюється педагогічна ефективність та залученість', outcome: 'Повнофункціональна навчальна платформа' },
      { name: 'Gamification', desc: 'Гейміфікація освіти', guidelines: 'Оцінюється залученість, прогрес та мотивація', outcome: 'Гра або геймифікований модуль навчання' },
    ],
    online: true, rulesUrl: 'https://hackflow.com/rules/eduhack',
  },
  {
    prefix: 'Health Sprint',
    subtitle: 'Здоров\'я в епоху цифровізації',
    description: 'Медтех-хакатон для розробників, лікарів та дослідників. Разом шукаємо технологічні рішення для покращення якості медичної допомоги в Україні.',
    tags: ['healthtech'],
    tracks: [
      { name: 'HealthAI', desc: 'AI для медицини та діагностики', guidelines: 'Оцінюється точність діагностики та безпека даних', outcome: 'Модель з валідацією на медичних даних' },
      { name: 'Telemedicine', desc: 'Телемедицина та дистанційна допомога', guidelines: 'Оцінюється зручність лікаря та пацієнта', outcome: 'Платформа для відеоконсультацій з бронюванням' },
    ],
    online: false, location: 'НТУ «ХПІ», Харків', rulesUrl: 'https://hackflow.com/rules/health-sprint',
  },
  {
    prefix: 'ChainHack',
    subtitle: 'Web3 та блокчейн-рішення',
    description: 'Хакатон для Web3-розробників. Будуємо децентралізоване майбутнє: DeFi-протоколи, NFT-платформи та DAO-механізми управління.',
    tags: ['blockchain'],
    tracks: [
      { name: 'DeFi', desc: 'Децентралізовані фінанси', guidelines: 'Оцінюється безпека смарт-контрактів та економічна модель', outcome: 'Задеплоєний контракт на тестнеті з фронтендом' },
      { name: 'NFT & Metaverse', desc: 'NFT та метавсесвіт', guidelines: 'Оцінюється оригінальність концепту та UX', outcome: 'NFT-колекція або metaverse-досвід' },
    ],
    online: true, rulesUrl: 'https://hackflow.com/rules/chainhack',
  },
  {
    prefix: 'GameJam UA',
    subtitle: '72-годинне створення гри',
    description: 'Щорічний ігровий джем для розробників, художників та звукорежисерів. За 72 години команди створюють повноцінні ігри за заданою темою.',
    tags: ['gamedev'],
    tracks: [
      { name: 'Mobile Game', desc: 'Мобільна гра (iOS/Android)', guidelines: 'Оцінюється геймплей, графіка та залучення', outcome: 'Гра, що завантажується та запускається' },
      { name: 'PC Game', desc: 'ПК або браузерна гра', guidelines: 'Оцінюється механіка, оригінальність та виконання', outcome: 'Виконуваний файл або веб-гра' },
    ],
    online: true, rulesUrl: 'https://hackflow.com/rules/gamejam',
  },
  {
    prefix: 'IoT Fest',
    subtitle: 'Інтернет речей та вбудовані системи',
    description: 'Хакатон для IoT-розробників та інженерів вбудованих систем. Учасники отримують доступ до обладнання: Raspberry Pi, Arduino, ESP32 та сенсорів.',
    tags: ['iot'],
    tracks: [
      { name: 'Smart Home', desc: 'Автоматизація дому та офісу', guidelines: 'Оцінюється функціональність, надійність та інтеграція', outcome: 'Фізичний прототип із демонстрацією' },
      { name: 'Industrial IoT', desc: 'Промисловий IoT та моніторинг', guidelines: 'Оцінюється масштабованість та відмовостійкість', outcome: 'Прототип + документація архітектури' },
    ],
    online: false, location: 'ДНУ ім. Олеся Гончара, Дніпро', rulesUrl: 'https://hackflow.com/rules/iot-fest',
  },
  {
    prefix: 'Open Source Sprint',
    subtitle: 'Внесок у відкрите ПЗ',
    description: 'Хакатон для контрибʼюторів відкритого ПЗ. Команди обирають існуючі проєкти або створюють нові бібліотеки та інструменти для спільноти.',
    tags: ['open-source'],
    tracks: [
      { name: 'DevTools', desc: 'Інструменти для розробників', guidelines: 'Оцінюється корисність, документація та тести', outcome: 'Опублікований пакет npm/pip/crates.io' },
      { name: 'Libraries', desc: 'Бібліотеки та фреймворки', guidelines: 'Оцінюється API, продуктивність та сумісність', outcome: 'Бібліотека з CI/CD та документацією' },
    ],
    online: true, rulesUrl: 'https://hackflow.com/rules/open-source',
  },
  {
    prefix: 'DevOps Hack',
    subtitle: 'Інфраструктура як код',
    description: 'Хакатон для DevOps-інженерів та SRE. Будуємо надійну, масштабовану інфраструктуру за допомогою сучасних інструментів IaC та хмарних технологій.',
    tags: ['devops', 'cloud'],
    tracks: [
      { name: 'Platform Eng', desc: 'Internal Developer Platform', guidelines: 'Оцінюється DX, автоматизація та документація', outcome: 'Задеплоєна IDP з документацією' },
      { name: 'Security as Code', desc: 'DevSecOps практики', guidelines: 'Оцінюється покриття безпеки та інтеграція в CI', outcome: 'Pipeline з автоматичним скануванням безпеки' },
    ],
    online: true, rulesUrl: 'https://hackflow.com/rules/devops-hack',
  },
  {
    prefix: 'Social Impact Hack',
    subtitle: 'Технології для суспільства',
    description: 'Хакатон соціальних інновацій. Шукаємо технологічні рішення для покращення якості життя вразливих груп населення, ветеранів та переселенців.',
    tags: ['social-impact'],
    tracks: [
      { name: 'Accessibility', desc: 'Доступність та інклюзивність', guidelines: 'Оцінюється відповідність WCAG, UX для людей з обмеженнями', outcome: 'Аудит + виправлений застосунок або новий продукт' },
      { name: 'Civic Tools', desc: 'Громадські інструменти та е-участь', guidelines: 'Оцінюється потенціал охоплення та практичне використання', outcome: 'Задеплоєна платформа з тестовими користувачами' },
    ],
    online: false, location: 'Київська Школа Економіки, Київ', rulesUrl: 'https://hackflow.com/rules/social-impact',
  },
  {
    prefix: 'Cloud Native Hack',
    subtitle: 'Хмарна розробка та мікросервіси',
    description: 'Хакатон для cloud-native розробників. Будуємо сервіси, готові до виробничого навантаження: мікросервіси, serverless, event-driven архітектура.',
    tags: ['cloud', 'devops'],
    tracks: [
      { name: 'Microservices', desc: 'Мікросервісна архітектура', guidelines: 'Оцінюється зв\'язність, масштабованість та observability', outcome: 'Задеплоєна система у Kubernetes' },
      { name: 'Serverless', desc: 'Безсерверні функції та event-driven', guidelines: 'Оцінюється вартість, холодний старт та надійність', outcome: 'Задеплоєна serverless-архітектура з моніторингом' },
    ],
    online: true, rulesUrl: 'https://hackflow.com/rules/cloud-native',
  },
];

const BANNERS = [
  'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1677442135703-1787eea5ce01?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1556075798-4825dfaaf498?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1591696205602-2f950c417cb9?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1496065187959-7f07b8353c55?auto=format&fit=crop&q=80&w=2000',
];

// ─── Clean ────────────────────────────────────────────────────────────────────

async function cleanDatabase() {
  await db.delete(scores);
  await db.delete(judgeConflicts);
  await db.delete(mentorRequests);
  await db.delete(mentorAvailabilities);
  await db.delete(projectResources);
  await db.delete(schema.projectResourceTypes);
  await db.delete(projects);
  await db.delete(schema.teamAwards);
  await db.delete(schema.awards);
  await db.delete(teamApprovals);
  await db.delete(teamMembers);
  await db.delete(teamStage);
  await db.delete(teams);
  await db.delete(criteria);
  await db.delete(judgeTrack);
  await db.delete(tracks);
  await db.delete(stages);
  await db.delete(hackathonTagRelations);
  await db.delete(hackathons);
  await db.delete(hackathonTags);
  await db.delete(userSocials);
  await db.delete(userRoles);
  await db.delete(users);
}

// ─── Roles ────────────────────────────────────────────────────────────────────

async function getRoles() {
  for (const name of ['admin', 'organizer', 'judge', 'mentor', 'participant'] as const) {
    await db.insert(roles).values({ name }).onConflictDoNothing();
  }
  const all = await db.select().from(roles);
  return {
    admin:       all.find(r => r.name === 'admin')!.id,
    organizer:   all.find(r => r.name === 'organizer')!.id,
    judge:       all.find(r => r.name === 'judge')!.id,
    mentor:      all.find(r => r.name === 'mentor')!.id,
    participant: all.find(r => r.name === 'participant')!.id,
  };
}

// ─── Users ────────────────────────────────────────────────────────────────────

async function seedUsers() {
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const roleIds = await getRoles();
  const out: Record<string, any> = {};

  // ── 1 Admin ───────────────────────────────────────────────────────────────
  const [admin] = await db.insert(users).values({
    email: 'admin@hackflow.com', fullName: 'Адмін Системи', username: 'admin',
    passwordHash, skills: ['Management', 'System Admin'], isLookingForTeam: false,
    description: 'Головний адміністратор платформи HackFlow.',
  }).returning();
  out['admin'] = admin;
  await db.insert(userRoles).values({ userId: admin.id, roleId: roleIds.admin });

  // ── 10 Organizers ─────────────────────────────────────────────────────────
  const organizerData = [
    { email: 'organizer1@hackflow.com', fullName: 'Іван Організаторенко',   username: 'organizer1', description: 'Організатор хакатонів у сфері AI та ML. 5 років досвіду проведення подій.' },
    { email: 'organizer2@hackflow.com', fullName: 'Наталія Менеджер',       username: 'organizer2', description: 'Спеціалістка з організації tech-заходів у Києві та Львові.' },
    { email: 'organizer3@hackflow.com', fullName: 'Олег Координатор',       username: 'organizer3', description: 'Event-менеджер з фокусом на студентські хакатони.' },
    { email: 'organizer4@hackflow.com', fullName: 'Вікторія Бюджетник',     username: 'organizer4', description: 'Фандрейзинг та спонсорство для tech-конкурсів.' },
    { email: 'organizer5@hackflow.com', fullName: 'Дмитро Логістик',        username: 'organizer5', description: 'Логістика та операційне управління hackathons.' },
    { email: 'organizer6@hackflow.com', fullName: 'Марія Стратегія',        username: 'organizer6', description: 'Стратегічний партнер хакатонів з корпоративним трендом.' },
    { email: 'organizer7@hackflow.com', fullName: 'Андрій Партнерський',    username: 'organizer7', description: 'Побудова партнерської мережі для tech-спільноти.' },
    { email: 'organizer8@hackflow.com', fullName: 'Тетяна Маркетинг',       username: 'organizer8', description: 'PR та маркетинг для технологічних змагань.' },
    { email: 'organizer9@hackflow.com', fullName: 'Сергій Технічний',       username: 'organizer9', description: 'Технічна інфраструктура та судочинство хакатонів.' },
    { email: 'organizer10@hackflow.com',fullName: 'Юлія Комьюніті',         username: 'organizer10',description: 'Побудова та підтримка developer community.' },
  ];
  for (const u of organizerData) {
    const [ins] = await db.insert(users).values({
      ...u, passwordHash, skills: ['Event Management', 'Project Management', 'Communication'],
      isLookingForTeam: false,
    }).returning();
    out[u.username] = ins;
    await db.insert(userRoles).values({ userId: ins.id, roleId: roleIds.organizer });
    await db.insert(userSocials).values([
      { userId: ins.id, typeSocial: 'telegram', url: `https://t.me/${u.username}` },
      { userId: ins.id, typeSocial: 'github',   url: `https://github.com/${u.username}` },
    ]);
  }

  // ── 20 Judges ─────────────────────────────────────────────────────────────
  const judgeData = [
    { name: 'Олена Коваль',        skills: ['AI/ML', 'Python', 'Data Science'] },
    { name: 'Михайло Бойко',       skills: ['Backend', 'Go', 'System Design'] },
    { name: 'Андрій Мельник',      skills: ['Frontend', 'React', 'UX'] },
    { name: 'Тетяна Волошин',      skills: ['Cybersecurity', 'Pentesting'] },
    { name: 'Сергій Давиденко',    skills: ['DevOps', 'Kubernetes', 'AWS'] },
    { name: 'Катерина Лук\'яненко',skills: ['Mobile', 'iOS', 'Swift'] },
    { name: 'Роман Гриценко',      skills: ['Blockchain', 'Solidity', 'Web3'] },
    { name: 'Аліна Панченко',      skills: ['Product', 'Strategy', 'Business'] },
    { name: 'Максим Яременко',     skills: ['IoT', 'Embedded', 'C++'] },
    { name: 'Юлія Ткаченко',       skills: ['HealthTech', 'Data Analysis'] },
    { name: 'Валентин Захаренко',  skills: ['EdTech', 'AI', 'Research'] },
    { name: 'Ірина Руденко',       skills: ['FinTech', 'Payments', 'Compliance'] },
    { name: 'Павло Остапенко',     skills: ['Cloud', 'GCP', 'Architecture'] },
    { name: 'Sofia Chen',          skills: ['NLP', 'LLM', 'Machine Learning'] },
    { name: 'James Wilson',        skills: ['Security', 'Cryptography'] },
    { name: 'Maria Garcia',        skills: ['Sustainability', 'GreenTech'] },
    { name: 'Lucas Martin',        skills: ['GameDev', 'Unity', 'UX'] },
    { name: 'Emma Johnson',        skills: ['Open Source', 'Community', 'Go'] },
    { name: 'Noah Williams',       skills: ['Microservices', 'Event-Driven'] },
    { name: 'Олексій Шевченко',    skills: ['Database', 'PostgreSQL', 'Performance'] },
  ];
  for (let i = 0; i < judgeData.length; i++) {
    const key = `judge${i + 1}`;
    const j = judgeData[i];
    const [ins] = await db.insert(users).values({
      email: `${key}@hackflow.com`,
      fullName: j.name, username: key, passwordHash,
      skills: j.skills, isLookingForTeam: false,
      description: `Суддя з досвідом у: ${j.skills.join(', ')}.`,
    }).returning();
    out[key] = ins;
    await db.insert(userRoles).values({ userId: ins.id, roleId: roleIds.judge });
    await db.insert(userSocials).values([
      { userId: ins.id, typeSocial: 'github',   url: `https://github.com/${key}` },
      { userId: ins.id, typeSocial: 'telegram', url: `https://t.me/${key}` },
    ]).onConflictDoNothing();
  }

  // ── 15 Mentors ────────────────────────────────────────────────────────────
  const mentorData = [
    { name: 'Sophia Chen',       skills: ['React','TypeScript','Node.js'],        bio: 'Senior Frontend Engineer у провідній tech-компанії. 8 років React.' },
    { name: 'Олексій Шевченко', skills: ['Python','ML','FastAPI'],                bio: 'ML Engineer, автор статей на Towards Data Science.' },
    { name: 'Аліна Петренко',   skills: ['UI/UX','Figma','Design Systems'],       bio: 'Product Designer, колишній Spotify. Ментор Projector Design.' },
    { name: 'James Brown',      skills: ['Go','Docker','Kubernetes'],              bio: 'Platform Engineer. Open source contributor до k8s.' },
    { name: 'Ірина Зінченко',   skills: ['Java','Spring Boot','Microservices'],   bio: 'Backend Architect. Досвід у фінтех-системах для 10M+ користувачів.' },
    { name: 'Василь Кириченко', skills: ['DevOps','Terraform','AWS'],             bio: 'Cloud Architect, AWS Certified Solutions Architect Pro.' },
    { name: 'Maria Santos',     skills: ['iOS','Swift','SwiftUI'],                bio: 'iOS Lead у стартапі зі сфери HealthTech. Apple WWDC Speaker.' },
    { name: 'Ігор Захаренко',   skills: ['Android','Kotlin','Jetpack'],           bio: 'Android Engineer, ex-Google. GDE у Android.' },
    { name: 'Lucas Martin',     skills: ['Blockchain','Solidity','Web3'],         bio: 'Smart Contract Auditor. Засновник DeFi-протоколу.' },
    { name: 'Emma Davis',       skills: ['Data Science','Spark','Airflow'],       bio: 'Data Engineer у великій retail-компанії. Kaggle Expert.' },
    { name: 'Богдан Лисенко',   skills: ['Cybersecurity','Pentesting','CTF'],     bio: 'Bug Bounty Hunter. 50+ CVE знайдено в корпоративних системах.' },
    { name: 'Олена Марченко',   skills: ['Product Management','Agile','OKR'],     bio: 'CPO у Growth-стартапі. Ex-Monobank product.' },
    { name: 'Tariq Al-Hassan',  skills: ['NLP','LLM','PyTorch'],                  bio: 'NLP Researcher, PhD у Computer Science. 20+ публікацій.' },
    { name: 'Анна Романенко',   skills: ['Gamification','Unity','C#'],            bio: 'Game Developer та EdTech Designer. 5 ігор у App Store.' },
    { name: 'Viktor Schmidt',   skills: ['Embedded','C++','RTOS'],                bio: 'Embedded Systems Engineer. 15 років у автомобільній галузі.' },
  ];
  for (let i = 0; i < mentorData.length; i++) {
    const key = `mentor${i + 1}`;
    const m = mentorData[i];
    const [ins] = await db.insert(users).values({
      email: `${key}@hackflow.com`,
      fullName: m.name, username: key, passwordHash,
      skills: m.skills, isLookingForTeam: false,
      description: m.bio,
    }).returning();
    out[key] = ins;
    await db.insert(userRoles).values({ userId: ins.id, roleId: roleIds.mentor });
    await db.insert(userSocials).values([
      { userId: ins.id, typeSocial: 'github',   url: `https://github.com/${key}` },
      { userId: ins.id, typeSocial: 'telegram', url: `https://t.me/${key}` },
      ...(i % 2 === 0 ? [{ userId: ins.id, typeSocial: 'discord' as const, url: `https://discord.com/users/${key}` }] : []),
    ]);
  }

  // ── 150 Participants ───────────────────────────────────────────────────────
  const usedNames = new Set<string>();
  for (let i = 0; i < 150; i++) {
    const key = `user${i + 1}`;
    let fullName = '';
    let fn: string, ln: string;
    do {
      fn = pick(UA_FIRST); ln = pick(UA_LAST); fullName = `${fn} ${ln}`;
    } while (usedNames.has(fullName));
    usedNames.add(fullName);

    const skillCount = rnd(2, 5);
    const userSkills = shuffle(ALL_SKILLS).slice(0, skillCount);
    const lookingForTeam = i % 4 === 0;

    const [ins] = await db.insert(users).values({
      email: `${key}@hackflow.com`, fullName, username: key, passwordHash,
      skills: userSkills, isLookingForTeam: lookingForTeam,
      description: `${fn} — розробник з ${rnd(1, 8)} роками досвіду. Навички: ${userSkills.join(', ')}.`,
    }).returning();
    out[key] = ins;
    await db.insert(userRoles).values({ userId: ins.id, roleId: roleIds.participant });

    if (i < 80) {
      const socials: any[] = [
        { userId: ins.id, typeSocial: 'github',   url: `https://github.com/${key}` },
        { userId: ins.id, typeSocial: 'telegram', url: `https://t.me/${key}` },
      ];
      if (i % 3 === 0) socials.push({ userId: ins.id, typeSocial: 'discord' as const, url: `https://discord.com/users/${key}` });
      if (i % 5 === 0) socials.push({ userId: ins.id, typeSocial: 'viber'   as const, url: `https://viber.com/${key}` });
      await db.insert(userSocials).values(socials);
    }
  }

  return out;
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

async function seedTags() {
  const tagNames = [
    'web','ai/ml','mobile','cybersecurity','blockchain','iot','edtech',
    'healthtech','fintech','gamedev','cloud','devops','open-source','sustainability','social-impact',
  ];
  const out: Record<string, any> = {};
  for (const name of tagNames) {
    const [ins] = await db.insert(hackathonTags).values({ name }).onConflictDoNothing().returning();
    if (ins) out[name] = ins;
  }
  const all = await db.select().from(hackathonTags);
  for (const t of all) out[t.name] = t;
  return out;
}

// ─── Resource types ───────────────────────────────────────────────────────────

async function seedResourceTypes() {
  const types = [
    { name: 'repository',    description: 'Репозиторій з кодом' },
    { name: 'demo',          description: 'Посилання на демо' },
    { name: 'presentation',  description: 'Презентація або слайди' },
    { name: 'video',         description: 'Відео демонстрація' },
    { name: 'documentation', description: 'Документація' },
    { name: 'other',         description: 'Інше' },
  ];
  const out: Record<string, any> = {};
  for (const t of types) {
    const [ins] = await db.insert(schema.projectResourceTypes).values(t).onConflictDoNothing().returning();
    if (ins) out[t.name] = ins;
  }
  const all = await db.select().from(schema.projectResourceTypes);
  for (const t of all) out[t.name] = t;
  return out;
}

// ─── 100 Hackathons ──────────────────────────────────────────────────────────

async function seedHackathons(allUsers: Record<string, any>, tags: Record<string, any>) {
  const TOTAL  = 100;
  const PAST   = 35; // ARCHIVED
  const ACTIVE = 8;  // PUBLISHED + started
  // 57 upcoming PUBLISHED

  const organizers = [
    'organizer1','organizer2','organizer3','organizer4','organizer5',
    'organizer6','organizer7','organizer8','organizer9','organizer10',
  ];
  const result: any[] = [];

  for (let i = 0; i < TOTAL; i++) {
    const theme     = HACKATHON_THEMES[i % HACKATHON_THEMES.length];
    const year      = i < PAST ? 2024 + Math.floor(i / 18) : 2026;
    const edition   = Math.floor(i / HACKATHON_THEMES.length) + 1;
    const title     = `${theme.prefix} ${year}${edition > 1 ? ` Edition ${edition}` : ''}`;
    const orgKey    = organizers[i % organizers.length];
    const createdBy = allUsers[orgKey]?.id;

    let startOffset: number;
    let status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

    if (i < PAST) {
      startOffset = -(PAST - i) * 5 - rnd(3, 15);
      status = 'ARCHIVED';
    } else if (i < PAST + ACTIVE) {
      startOffset = -rnd(1, 4);
      status = 'PUBLISHED';
    } else {
      const futureIdx = i - PAST - ACTIVE;
      startOffset = rnd(5, 15) + futureIdx * 4;
      status = futureIdx < 5 ? 'DRAFT' : 'PUBLISHED';
    }

    const duration  = rnd(2, 5);
    const startDate = daysFromNow(startOffset);
    const endDate   = daysFromNow(startOffset + duration);

    const maxTeamSize = rnd(3, 6);

    const [h] = await db.insert(hackathons).values({
      title,
      subtitle:     theme.subtitle,
      description:  theme.description + ` Хакатон триватиме ${duration} дні(в). Організатор: ${allUsers[orgKey]?.fullName}.`,
      online:       theme.online,
      location:     theme.online ? null : theme.location,
      contactEmail: `${orgKey}@hackflow.com`,
      minTeamSize:  rnd(1, 2),
      maxTeamSize,
      status,
      banner:       BANNERS[i % BANNERS.length],
      rulesUrl:     theme.rulesUrl,
      startDate,
      endDate,
      createdBy,
    }).returning();

    // Tags
    for (const tagName of theme.tags) {
      if (tags[tagName]) {
        await db.insert(hackathonTagRelations)
          .values({ hackathonId: h.id, tagId: tags[tagName].id })
          .onConflictDoNothing();
      }
    }

    // Extra tag for variety
    const extraTags = ['web','cloud','devops','open-source'];
    if (i % 7 === 0 && tags[extraTags[i % extraTags.length]]) {
      await db.insert(hackathonTagRelations)
        .values({ hackathonId: h.id, tagId: tags[extraTags[i % extraTags.length]].id })
        .onConflictDoNothing();
    }

    // Stages (all 4 fully filled)
    const regStart  = daysFromNow(startOffset - rnd(10, 21));
    const regEnd    = daysFromNow(startOffset - 1);
    const hackEnd   = daysFromNow(startOffset + Math.max(1, duration - 1));
    const judgeEnd  = endDate;
    const finEnd    = daysFromNow(startOffset + duration + rnd(1, 3));

    await db.insert(stages).values([
      { hackathonId: h.id, name: 'Реєстрація учасників', type: 'REGISTRATION', startDate: regStart, endDate: regEnd,   orderIndex: 1,
        description: 'Реєстрація команд та індивідуальних учасників. Підтвердження участі надсилається на email.' },
      { hackathonId: h.id, name: 'Хакінг',               type: 'HACKING',      startDate,           endDate: hackEnd,  orderIndex: 2,
        description: `Основна фаза розробки. Команди мають ${duration - 1} дні(в) для створення рішення.` },
      { hackathonId: h.id, name: 'Оцінювання проєктів',  type: 'JUDGING',      startDate: hackEnd,  endDate: judgeEnd, orderIndex: 3,
        description: 'Судді оцінюють проєкти за встановленими критеріями. Команди презентують рішення.' },
      { hackathonId: h.id, name: 'Нагородження',         type: 'FINISHED',     startDate: judgeEnd, endDate: finEnd,   orderIndex: 4,
        description: 'Оголошення переможців та вручення нагород. Святкова церемонія закриття.' },
    ]);

    // Tracks + Criteria (fully filled)
    const insertedTracks: any[] = [];
    for (const td of theme.tracks) {
      const [tr] = await db.insert(tracks).values({
        hackathonId:     h.id,
        name:            td.name,
        description:     td.desc,
        guidelines:      td.guidelines,
        expectedOutcome: td.outcome,
      }).returning();
      insertedTracks.push(tr);

      await db.insert(criteria).values([
        { trackId: tr.id, name: 'Технічна реалізація', weight: '0.35', maxScore: '10' },
        { trackId: tr.id, name: 'Інноваційність',       weight: '0.25', maxScore: '10' },
        { trackId: tr.id, name: 'Презентація',          weight: '0.20', maxScore: '10' },
        { trackId: tr.id, name: 'Практичність',         weight: '0.20', maxScore: '10' },
      ]);
    }

    result.push({ hackathon: h, startOffset, duration, status, tracks: insertedTracks, orgKey, createdBy });
  }

  return result;
}

// ─── Judge assignments ────────────────────────────────────────────────────────

async function seedJudgeAssignments(hackathonRows: any[], allUsers: Record<string, any>) {
  const judgeCount = 20;
  let inserted = 0;
  for (let hi = 0; hi < hackathonRows.length; hi++) {
    const { hackathon, tracks: hTracks } = hackathonRows[hi];
    for (let ti = 0; ti < hTracks.length; ti++) {
      const track = hTracks[ti];
      // 3 judges per track
      const jIdxA = ((hi * 2 + ti * 3)     % judgeCount) + 1;
      const jIdxB = ((hi * 2 + ti * 3 + 1) % judgeCount) + 1;
      const jIdxC = ((hi * 2 + ti * 3 + 2) % judgeCount) + 1;
      try {
        await db.insert(judgeTrack).values([
          { hackathonId: hackathon.id, userId: allUsers[`judge${jIdxA}`].id, trackId: track.id, isHeadJudge: true  },
          { hackathonId: hackathon.id, userId: allUsers[`judge${jIdxB}`].id, trackId: track.id, isHeadJudge: false },
          { hackathonId: hackathon.id, userId: allUsers[`judge${jIdxC}`].id, trackId: track.id, isHeadJudge: false },
        ]).onConflictDoNothing();
        inserted += 3;
      } catch { /* skip */ }
    }
  }
  return inserted;
}

// ─── Mentor availabilities ────────────────────────────────────────────────────

async function seedMentorData(hackathonRows: any[], allUsers: Record<string, any>) {
  const mentorCount = 15;
  let availCount = 0;

  for (let hi = 0; hi < hackathonRows.length; hi++) {
    const { hackathon, startOffset, tracks: hTracks } = hackathonRows[hi];
    // 1-2 availabilities per hackathon
    const numAvail = hi % 3 === 0 ? 2 : 1;
    hackathonRows[hi].availIds = [];
    hackathonRows[hi].mStarts  = [];

    for (let ai = 0; ai < numAvail; ai++) {
      const mKey  = `mentor${((hi + ai) % mentorCount) + 1}`;
      const track = hTracks[ai % hTracks.length];

      const mStart = daysFromNow(startOffset + 1 + ai);
      mStart.setHours(10 + ai * 3, 0, 0, 0);
      const mEnd = new Date(mStart.getTime() + 3 * 3_600_000);

      const [avail] = await db.insert(mentorAvailabilities).values({
        mentorId:      allUsers[mKey].id,
        hackathonId:   hackathon.id,
        trackId:       track?.id ?? null,
        startDatetime: mStart,
        endDatetime:   mEnd,
        slotDuration:  30,
      }).returning();
      availCount++;
      hackathonRows[hi].availIds.push(avail.id);
      hackathonRows[hi].mStarts.push(mStart);
    }
  }

  return { availCount };
}

// ─── Teams + Projects + Scores + Awards ───────────────────────────────────────

async function seedTeamsAndProjects(
  hackathonRows: any[],
  allUsers: Record<string, any>,
  resourceTypes: Record<string, any>,
) {
  const participantCount = 150;
  const judgeCount = 20;

  let teamCount    = 0;
  let projectCount = 0;
  let scoreCount   = 0;
  let awardCount   = 0;
  let reqCount     = 0;

  const usedTeamNames = new Set<string>();
  const PARTS_A = TEAM_NAME_PARTS_A;
  const PARTS_B = TEAM_NAME_PARTS_B;

  function genTeamName(): string {
    let n: string;
    let attempt = 0;
    do {
      n = `${pick(PARTS_A)}${pick(PARTS_B)}`;
      attempt++;
    } while (usedTeamNames.has(n) && attempt < 1000);
    usedTeamNames.add(n);
    return n;
  }

  // Distribute teams: past hackathons get 4-6 teams, active 3-5, future 2-4
  for (let hi = 0; hi < hackathonRows.length; hi++) {
    const row = hackathonRows[hi];
    const { hackathon, startOffset, status, tracks: hTracks, availIds = [], mStarts = [] } = row;
    const isPast   = status === 'ARCHIVED';
    const isActive = !isPast && startOffset < 0;

    const numTeams =
      isPast   ? rnd(4, 6) :
      isActive ? rnd(3, 5) :
                 rnd(2, 4);

    const allStages = await db.query.stages.findMany({
      where: (s, { eq }) => eq(s.hackathonId, hackathon.id),
    });
    const hackStage = allStages.find(s => s.type === 'HACKING');
    const finStage  = allStages.find(s => s.type === 'FINISHED');
    const stageForTeam = isPast ? finStage : hackStage;

    for (let ti = 0; ti < numTeams; ti++) {
      const track = hTracks[ti % hTracks.length];

      // ── Team ──────────────────────────────────────────────────────────────
      const approvalStatus: 'APPROVED' | 'PENDING' | 'REJECTED' =
        isPast              ? 'APPROVED' :
        ti === numTeams - 1 && hi % 6 === 0 ? 'PENDING' :
        hi % 15 === 0 && ti === 0            ? 'REJECTED' :
        'APPROVED';

      const logo = ti % 4 === 0
        ? `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(genTeamName())}`
        : undefined;

      const teamName = genTeamName();
      const [team] = await db.insert(teams).values({
        hackathonId: hackathon.id,
        name:        teamName,
        description: `${teamName} — команда що вирішує задачі у треку «${track.name}». ${pick(PROJECT_DESCS)}`,
        trackId:     track.id,
        logo:        logo ?? null,
      }).returning();
      teamCount++;

      // ── Members (captain + 2-4 members) ───────────────────────────────────
      const usedInTeam = new Set<number>();
      const base = ((hi * 7 + ti * 11) % participantCount);
      const memberCount = rnd(2, 4);
      const memberIdxs: number[] = [];
      for (let mi = 0; mi < memberCount + 1; mi++) {
        let idx = (base + mi * 13) % participantCount;
        while (usedInTeam.has(idx)) idx = (idx + 1) % participantCount;
        usedInTeam.add(idx);
        memberIdxs.push(idx);
      }

      const membersToInsert = memberIdxs.map((idx, mi) => ({
        teamId: team.id,
        userId: allUsers[`user${idx + 1}`].id,
        role:   mi === 0 ? 'captain' as const : 'participant' as const,
      }));
      await db.insert(teamMembers).values(membersToInsert).onConflictDoNothing();

      // ── Approval ──────────────────────────────────────────────────────────
      await db.insert(teamApprovals).values({
        teamId: team.id,
        status: approvalStatus,
        comment: approvalStatus === 'REJECTED' ? 'Команда не відповідає вимогам хакатону.' : null,
      });

      // ── Team stage ────────────────────────────────────────────────────────
      if (stageForTeam) {
        await db.insert(teamStage).values({ teamId: team.id, stageId: stageForTeam.id }).onConflictDoNothing();
      }

      // ── Project ───────────────────────────────────────────────────────────
      const stageForProj = stageForTeam ?? hackStage;
      if (!stageForProj) continue;

      const projStatus =
        isPast            ? 'SUBMITTED' :
        isActive && ti < 2 ? 'SUBMITTED' :
        isActive            ? 'DRAFT' :
        'DRAFT';

      const projTitle = PROJECT_TITLES[(hi * 3 + ti) % PROJECT_TITLES.length];
      const [proj] = await db.insert(projects).values({
        teamId:      team.id,
        stageId:     stageForProj.id,
        title:       projTitle,
        description: `${pick(PROJECT_DESCS)} Розроблено командою «${teamName}» у межах хакатону «${hackathon.title}», трек «${track.name}».`,
        status:      projStatus,
        submittedAt: projStatus === 'SUBMITTED' ? hoursAgo(rnd(1, 24)) : null,
        reviewedAt:  isPast && ti % 3 === 0 ? hoursAgo(rnd(1, 6)) : null,
        comment:     isPast && ti % 3 === 0 ? 'Проєкт відповідає всім критеріям оцінювання.' : null,
      }).returning();
      projectCount++;

      // ── Resources ─────────────────────────────────────────────────────────
      const resourcesToInsert: any[] = [];
      if (resourceTypes['repository']) {
        resourcesToInsert.push({ projectId: proj.id, projectTypeId: resourceTypes['repository'].id, url: `https://github.com/hackflow-${proj.id.slice(0, 8)}/project`, description: 'Основний репозиторій з кодом' });
      }
      if (resourceTypes['demo'] && (isPast || isActive)) {
        resourcesToInsert.push({ projectId: proj.id, projectTypeId: resourceTypes['demo'].id, url: `https://demo-${proj.id.slice(0, 6)}.hackflow.app`, description: 'Live демонстрація продукту' });
      }
      if (resourceTypes['presentation'] && isPast) {
        resourcesToInsert.push({ projectId: proj.id, projectTypeId: resourceTypes['presentation'].id, url: `https://slides.com/hackflow/${proj.id.slice(0, 6)}`, description: 'Презентаційні слайди' });
      }
      if (resourceTypes['video'] && isPast && ti % 3 === 0) {
        resourcesToInsert.push({ projectId: proj.id, projectTypeId: resourceTypes['video'].id, url: `https://youtube.com/watch?v=${proj.id.slice(0, 11)}`, description: 'Відеодемонстрація' });
      }
      if (resourcesToInsert.length > 0) {
        await db.insert(projectResources).values(resourcesToInsert).onConflictDoNothing();
      }

      // ── Scores (for past & submitted) ─────────────────────────────────────
      if (isPast && projStatus === 'SUBMITTED') {
        const trackCriteria = await db.query.criteria.findMany({
          where: (c, { eq }) => eq(c.trackId, track.id),
        });
        // 3 judges score each project
        const judges = [
          `judge${((hi + ti)     % judgeCount) + 1}`,
          `judge${((hi + ti + 1) % judgeCount) + 1}`,
          `judge${((hi + ti + 2) % judgeCount) + 1}`,
        ];
        for (const jKey of judges) {
          for (const crit of trackCriteria) {
            await db.insert(scores).values({
              judgeId:    allUsers[jKey].id,
              projectId:  proj.id,
              criteriaId: crit.id,
              assessment: (rnd(55, 100) / 10).toFixed(1),
              comment:    ti === 0 ? 'Відмінна технічна реалізація та інноваційність.' : null,
            }).onConflictDoNothing();
            scoreCount++;
          }
        }
      }

      // ── Mentor requests ───────────────────────────────────────────────────
      if (availIds.length > 0 && ti === 0) {
        const availId = availIds[0];
        const mStart  = mStarts[0] ?? daysFromNow(1);
        await db.insert(mentorRequests).values({
          mentorAvailabilityId: availId,
          teamId:               team.id,
          startDatetime:        mStart,
          durationMinute:       30,
          status:               isPast ? 'completed' as const : 'pending' as const,
          message:              'Потребуємо консультації щодо архітектури та стеку технологій нашого рішення.',
        }).onConflictDoNothing();
        reqCount++;
      }
    }

    // ── Awards for past hackathons ────────────────────────────────────────────
    if (isPast) {
      const hackTeams = await db.query.teams.findMany({
        where: (t, { eq }) => eq(t.hackathonId, hackathon.id),
      });
      const awardDefs = [
        { name: '🥇 Гран-прі',           place: 1, desc: 'Переможець хакатону — найкраще рішення' },
        { name: '🥈 Друге місце',         place: 2, desc: 'Срібна нагорода за інноваційність' },
        { name: '🥉 Третє місце',         place: 3, desc: 'Бронзова нагорода за технічну реалізацію' },
        { name: '🏆 Найкращий UI/UX',     place: 4, desc: 'Спеціальний приз за дизайн та UX' },
        { name: '💡 Найбільш інноваційне',place: 5, desc: 'Приз за найоригінальнішу ідею' },
      ];
      for (let ai = 0; ai < Math.min(hackTeams.length, 3); ai++) {
        const def = awardDefs[ai];
        const [aw] = await db.insert(schema.awards).values({
          hackathonId: hackathon.id, name: def.name, place: def.place, description: def.desc,
        }).returning();
        await db.insert(schema.teamAwards).values({ teamId: hackTeams[ai].id, awardId: aw.id }).onConflictDoNothing();
        awardCount++;
      }
      // Special award occasionally
      if (hi % 4 === 0 && hackTeams.length >= 4) {
        const [awSpec] = await db.insert(schema.awards).values({
          hackathonId: hackathon.id, name: awardDefs[3].name, place: awardDefs[3].place,
          description: awardDefs[3].desc,
        }).returning();
        await db.insert(schema.teamAwards).values({ teamId: hackTeams[3 % hackTeams.length].id, awardId: awSpec.id }).onConflictDoNothing();
        awardCount++;
      }
    }
  }

  return { teamCount, projectCount, scoreCount, awardCount, reqCount };
}

// ─── Judge conflicts ──────────────────────────────────────────────────────────

async function seedConflicts(hackathonRows: any[], allUsers: Record<string, any>) {
  const reasons = ['MENTORED', 'RELATIVE'] as const;
  let count = 0;
  for (let hi = 0; hi < Math.min(50, hackathonRows.length); hi++) {
    const { hackathon } = hackathonRows[hi];
    if (hi % 2 !== 0) continue; // every other hackathon
    const hackTeams = await db.query.teams.findMany({
      where: (t, { eq }) => eq(t.hackathonId, hackathon.id),
    });
    if (hackTeams.length === 0) continue;
    const jKey = `judge${(hi % 20) + 1}`;
    await db.insert(judgeConflicts).values({
      judgeId: allUsers[jKey].id,
      teamId:  hackTeams[0].id,
      reason:  reasons[hi % reasons.length],
    }).onConflictDoNothing();
    count++;
  }
  return count;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 Starting seed...');

  if (process.env.SEED_CLEAN === 'true') {
    console.log('🧹 Cleaning existing data...');
    await cleanDatabase();
  }

  const t0 = Date.now();

  console.log('👤 Seeding users (1 admin + 10 organizers + 20 judges + 15 mentors + 150 participants = 196)...');
  const allUsers = await seedUsers();

  console.log('🏷️  Seeding tags (15)...');
  const tags = await seedTags();

  console.log('📦 Seeding resource types (6)...');
  const resourceTypes = await seedResourceTypes();

  console.log('🏆 Seeding 100 hackathons (fully filled: stages + tracks + criteria)...');
  const hackathonRows = await seedHackathons(allUsers, tags);

  console.log('⚖️  Seeding judge assignments (3 judges/track × 200 tracks = ~600)...');
  const judgeRows = await seedJudgeAssignments(hackathonRows, allUsers);

  console.log('🧑🏫 Seeding mentor availabilities (~130)...');
  const { availCount } = await seedMentorData(hackathonRows, allUsers);

  console.log('👥 Seeding teams (4-6 past, 3-5 active, 2-4 future ≈ 350+)...');
  const { teamCount, projectCount, scoreCount, awardCount, reqCount } =
    await seedTeamsAndProjects(hackathonRows, allUsers, resourceTypes);

  console.log('⚠️  Seeding judge conflicts (~25)...');
  const conflictCount = await seedConflicts(hackathonRows, allUsers);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('');
  console.log('✅ Seed complete! (' + elapsed + 's)');
  console.log('');
  console.log('📊 Summary:');
  console.log(`   Users:                  ${Object.keys(allUsers).length}`);
  console.log(`   Hackathons:             ${hackathonRows.length}`);
  console.log(`   Judge assignments:      ${judgeRows}`);
  console.log(`   Mentor availabilities:  ${availCount}`);
  console.log(`   Mentor requests:        ${reqCount}`);
  console.log(`   Teams:                  ${teamCount}`);
  console.log(`   Projects:               ${projectCount}`);
  console.log(`   Scores:                 ${scoreCount}`);
  console.log(`   Awards:                 ${awardCount}`);
  console.log(`   Judge conflicts:        ${conflictCount}`);
  console.log('');
  console.log('Test accounts (password: Password123!):');
  console.log('  Admin:       admin@hackflow.com');
  console.log('  Organizer:   organizer1@hackflow.com');
  console.log('  Judge:       judge1@hackflow.com');
  console.log('  Mentor:      mentor1@hackflow.com');
  console.log('  Participant: user1@hackflow.com');

  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
