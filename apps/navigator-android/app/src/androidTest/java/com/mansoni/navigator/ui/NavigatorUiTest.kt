package com.mansoni.navigator.ui

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NavigatorUiTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun mapScreen_displaysMap() {
        composeTestRule.setContent {
            NavigatorAppTheme {
                MapScreen(navController = androidx.navigation.compose.rememberNavController())
            }
        }

        composeTestRule.onNodeWithText("Карта").assertExists()
    }
}
