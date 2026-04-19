"""backend_api URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/3.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path
from extraction.views import extract_regions_view, extract_regions_dual_view, extraction_passport, data_validation
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.conf.urls.static import static
from facial_recognition.views import verify_faces, clear_media_dirs, verify_face_endpoint, finalisation_process, save_pending_identification, get_dashboard_data, create_admin_view, login_view, get_user_details

urlpatterns = [
    path('extraction/', csrf_exempt(extract_regions_view), name='extraction_api'),
    path('extraction_dual/', csrf_exempt(extract_regions_dual_view),
         name='extraction_api1'),
    path('extraction_passport/', csrf_exempt(extraction_passport),
         name='extraction_api_passport'),
    path('data_validation/', csrf_exempt(data_validation), name='data_validation_api'),
    path('face_verification/', csrf_exempt(verify_faces),
         name='face_verification_api'),
    path('advenced_face_verification/', csrf_exempt(verify_face_endpoint),
         name='advenced_face_verification_api'),
    path('finalisation_process/', csrf_exempt(finalisation_process),
         name='finalisation_process_api'),
    path('save_pending_identification/', csrf_exempt(save_pending_identification), 
         name='save_pending_identification_api'),
    path('clear_session_files/', csrf_exempt(clear_media_dirs), name='clear_media_dirs'),
    
    # Auth & Dashboard (100% MongoDB - sans SQLite)
    path('api/login/', login_view, name='api_login'),
    path('api/dashboard/', get_dashboard_data, name='dashboard_api'),
    path('api/create-admin/', create_admin_view, name='create_admin_api'),
    path('api/userDetails/<str:user_id>/', get_user_details, name='user_details_api'),
]+ static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
