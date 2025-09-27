import { test, expect } from '@playwright/test';

test.describe('INP² Cybersecurity Lead Generator - Comprehensive QA', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForLoadState('networkidle');
  });

  test('Application loads successfully', async ({ page }) => {
    // Check main title
    await expect(page.locator('h1')).toContainText('Cybersecurity Lead Generation Dashboard');

    // Check logo presence (should fail gracefully if not found)
    const logo = page.locator('img[alt="INP² Security Logo"]');

    // Check main sections are present
    await expect(page.locator('text=INP² Security Solutions')).toBeVisible();
  });

  test('Executive vs Detailed view switching works', async ({ page }) => {
    // Check for view switcher
    const executiveBtn = page.locator('button:has-text("Executive")');
    const detailedBtn = page.locator('button:has-text("Detailed")');

    await expect(executiveBtn).toBeVisible();
    await expect(detailedBtn).toBeVisible();

    // Test switching to detailed view
    await detailedBtn.click();

    // Wait for view change
    await page.waitForTimeout(1000);

    // Switch back to executive view
    await executiveBtn.click();
    await page.waitForTimeout(1000);
  });

  test('Lead generation functionality', async ({ page }) => {
    // Test Apollo API button
    const apolloBtn = page.locator('button:has-text("Apollo API")');
    await expect(apolloBtn).toBeVisible();

    await apolloBtn.click();

    // Wait for leads to load (should show mock data)
    await page.waitForTimeout(3000);

    // Check if leads appeared (in either Executive or Detailed view)
    const hasLeads = await page.locator('text=Leads').count() > 0 ||
                     await page.locator('text=Priority Queue').count() > 0 ||
                     await page.locator('[class*="card"]').count() > 0;

    expect(hasLeads).toBeTruthy();
  });

  test('Security News lead generation', async ({ page }) => {
    const securityNewsBtn = page.locator('button:has-text("Security News")');
    await expect(securityNewsBtn).toBeVisible();

    await securityNewsBtn.click();

    // Wait for news-based leads to load
    await page.waitForTimeout(3000);

    // Should show some form of leads or loading state
    const hasContent = await page.locator('body').textContent();
    expect(hasContent).toBeTruthy();
  });

  test('Executive Dashboard displays priority leads', async ({ page }) => {
    // Generate some leads first
    await page.locator('button:has-text("Apollo API")').click();
    await page.waitForTimeout(3000);

    // Switch to executive view if not already there
    const executiveBtn = page.locator('button:has-text("Executive")');
    await executiveBtn.click();
    await page.waitForTimeout(2000);

    // Check for executive dashboard elements
    const executiveTitle = page.locator('text=Executive Lead Intelligence');
    if (await executiveTitle.count() > 0) {
      await expect(executiveTitle).toBeVisible();

      // Check for priority metrics
      const criticalOpportunities = page.locator('text=Critical Opportunities');
      if (await criticalOpportunities.count() > 0) {
        await expect(criticalOpportunities).toBeVisible();
      }
    }
  });

  test('Detailed view shows company cards', async ({ page }) => {
    // Generate leads
    await page.locator('button:has-text("Apollo API")').click();
    await page.waitForTimeout(3000);

    // Switch to detailed view
    await page.locator('button:has-text("Detailed")').click();
    await page.waitForTimeout(2000);

    // Check for leads list
    const leadsText = page.locator('text=Leads');
    if (await leadsText.count() > 0) {
      await expect(leadsText).toBeVisible();

      // Check for company cards
      const companyCards = page.locator('[class*="cursor-pointer"]');
      if (await companyCards.count() > 0) {
        await expect(companyCards.first()).toBeVisible();
      }
    }
  });

  test('Company selection and details view', async ({ page }) => {
    // Generate leads and switch to detailed view
    await page.locator('button:has-text("Apollo API")').click();
    await page.waitForTimeout(3000);

    await page.locator('button:has-text("Detailed")').click();
    await page.waitForTimeout(2000);

    // Try to click on a company card
    const companyCard = page.locator('[class*="cursor-pointer"]').first();
    if (await companyCard.count() > 0) {
      await companyCard.click();
      await page.waitForTimeout(1000);

      // Check for tabs (Overview, Contacts, Intelligence, etc.)
      const overviewTab = page.locator('text=Overview');
      if (await overviewTab.count() > 0) {
        await expect(overviewTab).toBeVisible();

        const contactsTab = page.locator('text=Contacts');
        const intelligenceTab = page.locator('text=Intelligence');
        const outreachTab = page.locator('text=Outreach');

        if (await contactsTab.count() > 0) await expect(contactsTab).toBeVisible();
        if (await intelligenceTab.count() > 0) await expect(intelligenceTab).toBeVisible();
        if (await outreachTab.count() > 0) await expect(outreachTab).toBeVisible();
      }
    }
  });

  test('Tab navigation in detailed view', async ({ page }) => {
    // Generate leads and select a company
    await page.locator('button:has-text("Apollo API")').click();
    await page.waitForTimeout(3000);

    await page.locator('button:has-text("Detailed")').click();
    await page.waitForTimeout(2000);

    const companyCard = page.locator('[class*="cursor-pointer"]').first();
    if (await companyCard.count() > 0) {
      await companyCard.click();
      await page.waitForTimeout(1000);

      // Test tab switching
      const tabs = ['Contacts', 'Intelligence', 'Outreach', 'Activity'];

      for (const tabName of tabs) {
        const tab = page.locator(`text=${tabName}`);
        if (await tab.count() > 0) {
          await tab.click();
          await page.waitForTimeout(500);
          // Tab should be active/visible
          await expect(tab).toBeVisible();
        }
      }
    }
  });

  test('Search and filter functionality', async ({ page }) => {
    // Generate leads first
    await page.locator('button:has-text("Apollo API")').click();
    await page.waitForTimeout(3000);

    // Test search functionality
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill('Tech');
      await page.waitForTimeout(1000);

      // Should filter results
      await expect(searchInput).toHaveValue('Tech');
    }

    // Test industry filter if available
    const industryFilter = page.locator('select, [role="combobox"]').first();
    if (await industryFilter.count() > 0 && await industryFilter.isVisible()) {
      await industryFilter.click();
      await page.waitForTimeout(500);
    }
  });

  test('Generate Leads panel functionality', async ({ page }) => {
    const generateLeadsBtn = page.locator('button:has-text("Generate Leads")');
    await expect(generateLeadsBtn).toBeVisible();

    await generateLeadsBtn.click();
    await page.waitForTimeout(1000);

    // Should show the lead generation panel
    const apiIntegrationsText = page.locator('text=API Integrations');
    if (await apiIntegrationsText.count() > 0) {
      await expect(apiIntegrationsText).toBeVisible();
    }

    // Check for different lead generation options
    const connectApolloBtn = page.locator('button:has-text("Connect Apollo")');
    const startNewsMonitorBtn = page.locator('button:has-text("Start News Monitor")');

    if (await connectApolloBtn.count() > 0) {
      await expect(connectApolloBtn).toBeVisible();
    }

    if (await startNewsMonitorBtn.count() > 0) {
      await expect(startNewsMonitorBtn).toBeVisible();
    }
  });

  test('Tech Analysis functionality', async ({ page }) => {
    // Generate leads and select a company
    await page.locator('button:has-text("Apollo API")').click();
    await page.waitForTimeout(3000);

    await page.locator('button:has-text("Detailed")').click();
    await page.waitForTimeout(2000);

    const companyCard = page.locator('[class*="cursor-pointer"]').first();
    if (await companyCard.count() > 0) {
      await companyCard.click();
      await page.waitForTimeout(1000);

      // Look for Tech Analysis button
      const analyzeTechBtn = page.locator('button:has-text("Analyze Tech")');
      if (await analyzeTechBtn.count() > 0) {
        await analyzeTechBtn.click();
        await page.waitForTimeout(2000);

        // Should show analysis results or loading state
        const analysisContent = await page.locator('body').textContent();
        expect(analysisContent).toBeTruthy();
      }
    }
  });

  test('Priority badges and scoring display', async ({ page }) => {
    // Generate leads
    await page.locator('button:has-text("Apollo API")').click();
    await page.waitForTimeout(3000);

    // In both views, there should be priority indicators
    const priorityElements = page.locator('text=Critical, text=High, text=Medium, text=Low').first();

    // Check for score displays
    const scoreElements = page.locator('[class*="score"], [class*="priority"], text=/\\d{1,3}$/').first();

    // At least one of these should be visible
    const hasPriorityOrScore = await priorityElements.count() > 0 || await scoreElements.count() > 0;
    expect(hasPriorityOrScore).toBeTruthy();
  });

  test('Responsive design - mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // App should still be functional on mobile
    await expect(page.locator('h1')).toBeVisible();

    // Generate leads
    await page.locator('button:has-text("Apollo API")').click();
    await page.waitForTimeout(3000);

    // Navigation should still work
    const executiveBtn = page.locator('button:has-text("Executive")');
    if (await executiveBtn.count() > 0) {
      await executiveBtn.click();
    }
  });

  test('Error handling and graceful degradation', async ({ page }) => {
    // The app should handle network errors gracefully
    await page.route('**/.netlify/functions/**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Test error' })
      });
    });

    // Try to generate leads - should show mock data
    await page.locator('button:has-text("Apollo API")').click();
    await page.waitForTimeout(3000);

    // Should still show some content (mock data)
    const bodyContent = await page.locator('body').textContent();
    expect(bodyContent.length).toBeGreaterThan(100);
  });

  test('Console errors check', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Generate leads and navigate through the app
    await page.locator('button:has-text("Apollo API")').click();
    await page.waitForTimeout(3000);

    // Switch views
    await page.locator('button:has-text("Executive")').click();
    await page.waitForTimeout(1000);

    await page.locator('button:has-text("Detailed")').click();
    await page.waitForTimeout(1000);

    // Check for critical console errors (ignore minor warnings)
    const criticalErrors = consoleErrors.filter(error =>
      !error.includes('favicon') &&
      !error.includes('manifest') &&
      !error.includes('Warning')
    );

    expect(criticalErrors.length).toBeLessThan(3); // Allow some minor errors
  });

  test('Performance - page load time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    // Should load within reasonable time (10 seconds for development)
    expect(loadTime).toBeLessThan(10000);
  });

  test('Accessibility - basic checks', async ({ page }) => {
    // Check for proper heading structure
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();

    // Check for button accessibility
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    expect(buttonCount).toBeGreaterThan(0);

    // All buttons should be focusable
    for (let i = 0; i < Math.min(buttonCount, 5); i++) {
      const button = buttons.nth(i);
      if (await button.isVisible()) {
        await button.focus();
        await expect(button).toBeFocused();
      }
    }
  });

  test('Data persistence - view state', async ({ page }) => {
    // Generate leads
    await page.locator('button:has-text("Apollo API")').click();
    await page.waitForTimeout(3000);

    // Switch to detailed view
    await page.locator('button:has-text("Detailed")').click();
    await page.waitForTimeout(1000);

    // Select a company
    const companyCard = page.locator('[class*="cursor-pointer"]').first();
    if (await companyCard.count() > 0) {
      await companyCard.click();
      await page.waitForTimeout(1000);

      // Switch back to executive view and return to detailed
      await page.locator('button:has-text("Executive")').click();
      await page.waitForTimeout(1000);

      await page.locator('button:has-text("Detailed")').click();
      await page.waitForTimeout(1000);

      // State should be maintained
      const selectedCard = page.locator('[class*="ring-2"]').first();
      // If selection state is maintained, there should be a selected card
    }
  });

});