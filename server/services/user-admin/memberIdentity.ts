import { pinyin } from "pinyin-pro";

const chinesePersonalName = /^[\p{Script=Han}]{2,6}$/u;
const trailingTitle = /(?:教授|老师|博士后?|硕士|先生|女士)$/u;
const compoundSurnames = new Set([
  "欧阳", "太史", "端木", "上官", "司马", "东方", "独孤", "南宫", "万俟", "闻人",
  "夏侯", "诸葛", "尉迟", "公羊", "赫连", "澹台", "皇甫", "宗政", "濮阳", "公冶",
  "太叔", "申屠", "公孙", "慕容", "仲孙", "钟离", "长孙", "宇文", "司徒", "鲜于",
  "司空", "闾丘", "子车", "亢官", "司寇", "巫马", "公西", "颛孙", "壤驷", "公良",
  "漆雕", "乐正", "宰父", "谷梁", "拓跋", "夹谷", "轩辕", "令狐", "段干", "百里",
  "呼延", "东郭", "南门", "羊舌", "微生", "公户", "公玉", "公仪", "梁丘", "公仲",
  "公上", "公门", "公山", "公坚", "左丘", "公伯", "西门", "公祖", "第五", "公乘",
  "贯丘", "公皙", "南荣", "东里", "东宫", "仲长", "子书", "子桑", "即墨", "达奚",
  "褚师",
]);

function titleCase(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1).toLowerCase()}` : "";
}

export function isNormalizedChinesePersonalName(value: string) {
  return chinesePersonalName.test(value) && !trailingTitle.test(value);
}

export function personIdentityFromChineseName(nameZh: string) {
  const normalizedNameZh = nameZh.trim().replace(/\s+/g, "");
  if (!isNormalizedChinesePersonalName(normalizedNameZh)) return null;
  const syllables = pinyin(normalizedNameZh, {
    mode: "surname",
    surname: "head",
    toneType: "none",
    type: "array",
    v: true,
  }).map((value) => value.toLowerCase().replace(/[^a-z]/g, ""));
  if (syllables.some((value) => !value)) return null;
  const surnameLength = compoundSurnames.has(normalizedNameZh.slice(0, 2)) ? 2 : 1;
  const surname = syllables.slice(0, surnameLength).join("");
  const givenName = syllables.slice(surnameLength).join("");
  if (!surname || !givenName) return null;
  return {
    nameZh: normalizedNameZh,
    username: `${surname}${givenName}`,
    nameEn: `${titleCase(givenName)}-${titleCase(surname)}`,
  };
}
