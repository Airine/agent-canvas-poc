import {expect,type Page,type Locator} from '@playwright/test';
export async function openSessionMenu(page:Page){const menu=page.getByRole('dialog',{name:'会话操作',exact:true});if(!await menu.isVisible())await page.getByRole('button',{name:'会话操作',exact:true}).click();await expect(menu).toBeVisible();return menu;}
export async function openDiagnostics(page:Page){await openSessionMenu(page);await page.getByRole('button',{name:'会话诊断',exact:true}).click();await expect(page.getByRole('dialog',{name:'会话诊断',exact:true})).toBeVisible();}
export async function stopSession(page:Page){await openSessionMenu(page);await page.getByRole('button',{name:'停止会话',exact:true}).click();await page.keyboard.press('Escape');}

export async function setCardView(page:Page,card:Locator,value:string){await card.getByRole('button',{name:'会话操作',exact:true}).click();const menu=page.getByRole('dialog',{name:'会话操作',exact:true});await menu.getByRole('combobox',{name:'卡片视图'}).selectOption(value);if(await menu.isVisible()){await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);}}
export async function expectCardView(page:Page,card:Locator,value:string){await card.getByRole('button',{name:'会话操作',exact:true}).click();const menu=page.getByRole('dialog',{name:'会话操作',exact:true});await expect(menu.getByRole('combobox',{name:'卡片视图'})).toHaveValue(value);await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);}

export async function openModelList(page:Page){const menu=page.getByRole('dialog',{name:'执行配置',exact:true});if(!await menu.isVisible())await page.getByRole('button',{name:'执行配置',exact:true}).click();if(await menu.getByRole('button',{name:'选择执行模型',exact:true}).isVisible())await menu.getByRole('button',{name:'选择执行模型',exact:true}).click();await expect(menu.getByLabel('搜索模型')).toBeVisible();return menu;}
export function runtimeModelOption(page:Page,provider:string,id:string){return page.locator(`.chat-model-choice[data-model-provider=${JSON.stringify(provider)}][data-model-id=${JSON.stringify(id)}]`);}
export async function chooseRuntimeModel(page:Page,provider:string,id:string){await openModelList(page);await runtimeModelOption(page,provider,id).click();}
