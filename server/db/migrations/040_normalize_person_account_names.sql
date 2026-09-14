-- Person login names are surname + given-name pinyin. Public member slugs remain
-- unchanged so existing website URLs continue to work.
WITH identity_map(old_username, new_username, name_zh, name_en) AS (
  VALUES
    ('haowei-zhang', 'zhanghaowei', '张豪威', 'Haowei-Zhang'),
    ('hongji-yan', 'yanhongji', '严宏基', 'Hongji-Yan'),
    ('hongyu-qiu', 'qiuhongyu', '仇宏煜', 'Hongyu-Qiu'),
    ('junhui-lei', 'leijunhui', '雷俊辉', 'Junhui-Lei'),
    ('jun-li', 'lijun', '李骏', 'Jun-Li'),
    ('junyi-feng', 'fengjunyi', '冯隽怡', 'Junyi-Feng'),
    ('kaixiang-lu', 'lukaixiang', '卢开祥', 'Kaixiang-Lu'),
    ('kaixin-feng', 'fengkaixin', '冯凯鑫', 'Kaixin-Feng'),
    ('li-hua', 'lihua', '李华', 'Hua-Li'),
    ('mingyang-zhou', 'zhoumingyang', '周明杨', 'Mingyang-Zhou'),
    ('qiyu-zhang', 'zhangqiyu', '张骐誉', 'Qiyu-Zhang'),
    ('shuhao-cui', 'cuishuhao', '崔书豪', 'Shuhao-Cui'),
    ('sikang-liu', 'liusikang', '刘思康', 'Sikang-Liu'),
    ('tianxiang-zhang', 'zhangtianxiang', '张天翔', 'Tianxiang-Zhang'),
    ('tingting-lei', 'leitingting', '雷婷婷', 'Tingting-Lei'),
    ('wenlei-fan', 'fanwenlei', '范文蕾', 'Wenlei-Fan'),
    ('xuan-huang', 'huangxuan', '黄璇', 'Xuan-Huang'),
    ('xuan-wei', 'weixuan', '魏玄', 'Xuan-Wei'),
    ('xuanxuan-zhang', 'zhangxuanxuan', '张轩轩', 'Xuanxuan-Zhang'),
    ('xuehang-sun', 'sunxuehang', '孙雪航', 'Xuehang-Sun'),
    ('xueli-guo', 'guoxueli', '郭学立', 'Xueli-Guo'),
    ('yan-xu', 'xuyan', '徐燕', 'Yan-Xu'),
    ('yida-wei', 'weiyida', '韦依达', 'Yida-Wei'),
    ('yizhou-xue', 'xueyizhou', '薛艺舟', 'Yizhou-Xue'),
    ('you-li', 'liyou', '李由', 'You-Li'),
    ('yuan-tu', 'tuyuan', '涂嫄', 'Yuan-Tu'),
    ('zemin-wang', 'wangzemin', '王泽民', 'Zemin-Wang'),
    ('zhenchao-li', 'lizhenchao', '李振超', 'Zhenchao-Li'),
    ('zhenqi-zheng', 'zhengzhenqi', '郑镇奇', 'Zhenqi-Zheng'),
    ('zhichao-wen', 'wenzhichao', '文志超', 'Zhichao-Wen'),
    ('zixuan-huang', 'huangzixuan', '黄子旋', 'Zixuan-Huang'),
    ('zongbo-liao', 'liaozongbo', '廖宗波', 'Zongbo-Liao')
), changed AS (
  UPDATE users account
  SET username = identity_map.new_username,
      display_name = identity_map.name_zh,
      updated_at = now()
  FROM identity_map
  WHERE account.account_kind = 'person'
    AND account.username = identity_map.old_username
  RETURNING account.id, identity_map.old_username, identity_map.new_username,
    identity_map.name_zh, identity_map.name_en
)
INSERT INTO audit_logs(actor_id, action, target_type, target_id, detail)
SELECT NULL, 'user.identity_normalize', 'user', changed.id::text,
  jsonb_build_object(
    'oldUsername', changed.old_username,
    'newUsername', changed.new_username,
    'nameZh', changed.name_zh,
    'nameEn', changed.name_en,
    'source', 'migration-040'
  )
FROM changed;

WITH identity_map(username, name_zh, name_en) AS (
  VALUES
    ('zhanghaowei', '张豪威', 'Haowei-Zhang'), ('yanhongji', '严宏基', 'Hongji-Yan'),
    ('qiuhongyu', '仇宏煜', 'Hongyu-Qiu'), ('leijunhui', '雷俊辉', 'Junhui-Lei'),
    ('lijun', '李骏', 'Jun-Li'), ('fengjunyi', '冯隽怡', 'Junyi-Feng'),
    ('lukaixiang', '卢开祥', 'Kaixiang-Lu'), ('fengkaixin', '冯凯鑫', 'Kaixin-Feng'),
    ('lihua', '李华', 'Hua-Li'), ('zhoumingyang', '周明杨', 'Mingyang-Zhou'),
    ('zhangqiyu', '张骐誉', 'Qiyu-Zhang'), ('cuishuhao', '崔书豪', 'Shuhao-Cui'),
    ('liusikang', '刘思康', 'Sikang-Liu'), ('zhangtianxiang', '张天翔', 'Tianxiang-Zhang'),
    ('leitingting', '雷婷婷', 'Tingting-Lei'), ('fanwenlei', '范文蕾', 'Wenlei-Fan'),
    ('huangxuan', '黄璇', 'Xuan-Huang'), ('weixuan', '魏玄', 'Xuan-Wei'),
    ('zhangxuanxuan', '张轩轩', 'Xuanxuan-Zhang'), ('sunxuehang', '孙雪航', 'Xuehang-Sun'),
    ('guoxueli', '郭学立', 'Xueli-Guo'), ('xuyan', '徐燕', 'Yan-Xu'),
    ('weiyida', '韦依达', 'Yida-Wei'), ('xueyizhou', '薛艺舟', 'Yizhou-Xue'),
    ('liyou', '李由', 'You-Li'), ('tuyuan', '涂嫄', 'Yuan-Tu'),
    ('wangzemin', '王泽民', 'Zemin-Wang'), ('lizhenchao', '李振超', 'Zhenchao-Li'),
    ('zhengzhenqi', '郑镇奇', 'Zhenqi-Zheng'), ('wenzhichao', '文志超', 'Zhichao-Wen'),
    ('huangzixuan', '黄子旋', 'Zixuan-Huang'), ('liaozongbo', '廖宗波', 'Zongbo-Liao')
)
UPDATE user_profiles profile
SET name_zh = identity_map.name_zh,
    name_en = identity_map.name_en,
    version = profile.version + 1,
    profile_content_updated_at = now(),
    updated_at = now()
FROM users account, identity_map
WHERE account.id = profile.user_id
  AND account.account_kind = 'person'
  AND account.username = identity_map.username
  AND (profile.name_zh, profile.name_en) IS DISTINCT FROM (identity_map.name_zh, identity_map.name_en);
